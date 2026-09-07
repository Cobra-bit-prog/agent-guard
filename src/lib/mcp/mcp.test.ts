import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleMcpDelete,
  handleMcpGet,
  handleMcpOptions,
  handleMcpPost,
  type McpCallTool,
} from "./handle.ts";
import { mcpDiscovery, MCP_TOOLS } from "./tools.ts";
import {
  DEFAULT_PROTOCOL_VERSION,
  MCP_SESSION_HEADER,
  acceptTokens,
  encodeSseMessage,
  generateSessionId,
  isValidSessionId,
  negotiateProtocolVersion,
  originIsInvalid,
  parseSseJsonRpc,
  protocolVersionHeaderUnsupported,
  responseMode,
  sseEventName,
} from "./transport.ts";

const STREAMABLE_ACCEPT = "application/json, text/event-stream";

function jsonRpc(method: string, extra: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id: 1, method, ...extra };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://agent-control.net/api/v1/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const refuseUnknown: McpCallTool = async (name) => ({
  ok: false,
  status: 400,
  code: -32601,
  message: `Unknown tool: ${name}`,
});

async function pricingTool(): Promise<McpCallTool> {
  return async (name, _args, apiKey) => {
    if (name === "get_pricing") {
      return { ok: true, result: { product: "Agent Control", tagged: true } };
    }
    if (name === "get_status") {
      if (!apiKey) return { ok: false, status: 401, code: 401, message: "Missing API key." };
      return { ok: true, result: { plan: "starter", writable: true } };
    }
    return { ok: false, status: 400, code: -32601, message: "Unknown tool." };
  };
}

describe("streamable-http accept and SSE framing", () => {
  it("treats official Accept: application/json, text/event-stream as SSE", () => {
    assert.deepEqual(acceptTokens(STREAMABLE_ACCEPT), ["application/json", "text/event-stream"]);
    assert.equal(responseMode(STREAMABLE_ACCEPT), "sse");
    assert.equal(responseMode("text/event-stream"), "sse");
    assert.equal(responseMode("application/json"), "json");
    assert.equal(responseMode(null), "json");
  });

  it("encodes a JSON-RPC result as an SSE message event", () => {
    const frame = encodeSseMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } }, "evt-1");
    assert.match(frame, /^id: evt-1\n/);
    assert.equal(sseEventName(frame), "message");
    assert.ok(frame.endsWith("\n\n"));
    assert.deepEqual(parseSseJsonRpc(frame), { jsonrpc: "2.0", id: 1, result: { ok: true } });
  });
});

describe("session ids", () => {
  it("generates a cryptographically random visible-ASCII session id", () => {
    const id = generateSessionId();
    assert.equal(isValidSessionId(id), true);
    assert.notEqual(id, generateSessionId());
  });

  it("rejects short or control-character session ids", () => {
    assert.equal(isValidSessionId("abc"), false);
    assert.equal(isValidSessionId("bad id with space"), false);
    assert.equal(isValidSessionId("ok-session-id"), true);
  });
});

describe("origin and protocol version", () => {
  it("allows missing Origin and valid https Origin", () => {
    assert.equal(originIsInvalid(null), false);
    assert.equal(originIsInvalid("https://agent-control.net"), false);
    assert.equal(originIsInvalid("not a url"), true);
    assert.equal(originIsInvalid("ftp://example.com"), true);
  });

  it("echoes a supported protocol version and defaults otherwise", () => {
    assert.equal(negotiateProtocolVersion("2025-06-18"), "2025-06-18");
    assert.equal(negotiateProtocolVersion("2025-11-25"), "2025-11-25");
    assert.equal(negotiateProtocolVersion("nope"), DEFAULT_PROTOCOL_VERSION);
    assert.equal(protocolVersionHeaderUnsupported(null), false);
    assert.equal(protocolVersionHeaderUnsupported("2025-03-26"), false);
    assert.equal(protocolVersionHeaderUnsupported("1999-01-01"), true);
  });
});

describe("POST initialize is Streamable HTTP", () => {
  it("returns SSE frames and Mcp-Session-Id for Accept: application/json, text/event-stream", async () => {
    const res = await handleMcpPost(
      post(
        jsonRpc("initialize", {
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "registry-probe", version: "1.0.0" },
          },
        }),
        { Accept: STREAMABLE_ACCEPT },
      ),
      { callTool: refuseUnknown },
    );

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const session = res.headers.get("mcp-session-id");
    assert.ok(session && isValidSessionId(session));
    assert.ok(res.headers.get("access-control-expose-headers")?.toLowerCase().includes("mcp-session-id"));

    const body = await res.text();
    assert.equal(sseEventName(body), "message");
    const rpc = parseSseJsonRpc(body) as {
      jsonrpc: string;
      id: number;
      result: { protocolVersion: string; serverInfo: { name: string }; capabilities: { tools: object } };
    };
    assert.equal(rpc.jsonrpc, "2.0");
    assert.equal(rpc.id, 1);
    assert.equal(rpc.result.protocolVersion, "2025-06-18");
    assert.equal(rpc.result.serverInfo.name, "Agent Control");
    assert.ok(rpc.result.capabilities.tools);
  });

  it("returns application/json plus Mcp-Session-Id when Accept is JSON only", async () => {
    const res = await handleMcpPost(
      post(jsonRpc("initialize", { params: { protocolVersion: "2025-03-26", capabilities: {} } }), {
        Accept: "application/json",
      }),
      { callTool: refuseUnknown },
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.ok(res.headers.get(MCP_SESSION_HEADER));
    const rpc = (await res.json()) as { result: { protocolVersion: string } };
    assert.equal(rpc.result.protocolVersion, "2025-03-26");
  });
});

describe("initialized notification and session reuse", () => {
  it("returns 202 Accepted for notifications/initialized", async () => {
    const init = await handleMcpPost(
      post(jsonRpc("initialize", { params: { protocolVersion: "2025-06-18", capabilities: {} } }), {
        Accept: STREAMABLE_ACCEPT,
      }),
      { callTool: refuseUnknown },
    );
    const session = init.headers.get("mcp-session-id") ?? "";
    const res = await handleMcpPost(
      post(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { Accept: STREAMABLE_ACCEPT, [MCP_SESSION_HEADER]: session },
      ),
      { callTool: refuseUnknown },
    );
    assert.equal(res.status, 202);
    assert.equal(await res.text(), "");
    assert.equal(res.headers.get("mcp-session-id"), session);
  });

  it("lists the same tools over SSE when the session header is sent", async () => {
    const init = await handleMcpPost(
      post(jsonRpc("initialize", { params: { protocolVersion: "2025-06-18", capabilities: {} } }), {
        Accept: STREAMABLE_ACCEPT,
      }),
      { callTool: refuseUnknown },
    );
    const session = init.headers.get("mcp-session-id") ?? "";
    const res = await handleMcpPost(
      post(jsonRpc("tools/list"), { Accept: STREAMABLE_ACCEPT, [MCP_SESSION_HEADER]: session }),
      { callTool: refuseUnknown },
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const rpc = parseSseJsonRpc(await res.text()) as { result: { tools: { name: string }[] } };
    const names = rpc.result.tools.map((tool) => tool.name);
    assert.deepEqual(names, MCP_TOOLS.map((tool) => tool.name));
    assert.ok(names.includes("check_transfer"));
    assert.ok(names.includes("get_pricing"));
  });

  it("returns 404 for a malformed session id", async () => {
    const res = await handleMcpPost(
      post(jsonRpc("tools/list"), { Accept: "application/json", [MCP_SESSION_HEADER]: "no" }),
      { callTool: refuseUnknown },
    );
    assert.equal(res.status, 404);
  });
});

describe("tools/call over Streamable HTTP", () => {
  it("calls get_pricing without a key and wraps the result as MCP content", async () => {
    const res = await handleMcpPost(
      post(jsonRpc("tools/call", { params: { name: "get_pricing", arguments: {} } }), {
        Accept: STREAMABLE_ACCEPT,
      }),
      { callTool: await pricingTool() },
    );
    assert.equal(res.status, 200);
    const rpc = parseSseJsonRpc(await res.text()) as {
      result: { content: { type: string; text: string }[] };
    };
    assert.equal(rpc.result.content[0]?.type, "text");
    assert.match(rpc.result.content[0]?.text ?? "", /Agent Control/);
  });

  it("keeps Bearer key auth for spend/status tools", async () => {
    const missing = await handleMcpPost(
      post(jsonRpc("tools/call", { params: { name: "get_status", arguments: {} } }), {
        Accept: "application/json",
      }),
      { callTool: await pricingTool() },
    );
    assert.equal(missing.status, 401);

    const ok = await handleMcpPost(
      post(jsonRpc("tools/call", { params: { name: "get_status", arguments: {} } }), {
        Accept: "application/json",
        Authorization: "Bearer ag_test_key",
      }),
      { callTool: await pricingTool() },
    );
    assert.equal(ok.status, 200);
    const rpc = (await ok.json()) as { result: { content: { text: string }[] } };
    assert.match(rpc.result.content[0]?.text ?? "", /starter/);
  });

  it("still accepts legacy JSON clients that omit Accept and session", async () => {
    const res = await handleMcpPost(post(jsonRpc("tools/list")), { callTool: refuseUnknown });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const rpc = (await res.json()) as { result: { tools: unknown[] } };
    assert.equal(rpc.result.tools.length, MCP_TOOLS.length);
  });
});

describe("GET discovery and DELETE", () => {
  it("keeps the existing discovery JSON shape", async () => {
    const discovery = mcpDiscovery();
    assert.equal(discovery.name, "Agent Control");
    assert.equal(discovery.protocol, "mcp");
    assert.ok(Array.isArray(discovery.tools));
    assert.match(discovery.auth, /Bearer agent API key/);
    assert.deepEqual(discovery.storefront, [
      "get_pricing",
      "start_trial",
      "attach_human",
      "create_checkout",
      "get_status",
    ]);
    const res = handleMcpGet(new Request("https://agent-control.net/api/v1/mcp"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), discovery);
  });

  it("returns 405 for a Streamable HTTP listen GET (no GET SSE stream)", () => {
    const res = handleMcpGet(
      new Request("https://agent-control.net/api/v1/mcp", {
        headers: { Accept: "text/event-stream" },
      }),
    );
    assert.equal(res.status, 405);
  });

  it("OPTIONS allows POST and DELETE plus the session header", () => {
    const res = handleMcpOptions();
    assert.equal(res.status, 204);
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /DELETE/);
    assert.match(res.headers.get("access-control-allow-headers") ?? "", /Mcp-Session-Id/i);
  });

  it("DELETE terminates a well-formed session", () => {
    const req = new Request("https://agent-control.net/api/v1/mcp", {
      method: "DELETE",
      headers: { [MCP_SESSION_HEADER]: generateSessionId() },
    });
    const res = handleMcpDelete(req);
    assert.equal(res.status, 200);
  });

  it("draft server.json claims streamable-http at the live MCP URL", () => {
    const raw = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../server.json"),
      "utf8",
    );
    const spec = JSON.parse(raw) as {
      name: string;
      remotes: { type: string; url: string }[];
    };
    assert.equal(spec.name, "net.agent-control/agent-control");
    assert.equal(spec.remotes[0]?.type, "streamable-http");
    assert.equal(spec.remotes[0]?.url, "https://agent-control.net/api/v1/mcp");
    assert.doesNotMatch(raw, /\bbroadcast/i);
  });
});
