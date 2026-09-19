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
import { MCP_TOOLS, mcpDiscovery } from "./tools.ts";
import { meterMcpToolResult, rejectMeterKeyUpload, reshapeMeter402Invoice } from "./meter-result.ts";
import { handleMeterRequest } from "../meter/http.ts";
import { createMeterStore } from "../meter/store.ts";
import { METER_ADAPTER_URL, METER_BASE_ADAPTER_URL, METER_NEXT_TOOL, meter402Body, meter402Next, meter402PayPage } from "../meter/pricing.ts";
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

  it("initialize instructions list Agent Meter tools including meter_watch", async () => {
    const res = await handleMcpPost(
      post(jsonRpc("initialize", { params: { protocolVersion: "2025-03-26", capabilities: {} } }), {
        Accept: "application/json",
      }),
      { callTool: refuseUnknown },
    );
    const rpc = (await res.json()) as { result: { instructions: string } };
    const instructions = rpc.result.instructions ?? "";
    assert.match(
      instructions,
      /meter_pricing \/ meter_buy_pass \/ meter_watch \/ meter_scan \/ meter_preflight \/ meter_scan_batch \/ meter_stamp \/ meter_verify_stamp/,
    );
    for (const name of mcpDiscovery().meter) {
      assert.match(instructions, new RegExp(`\\b${name}\\b`));
    }
    assert.match(instructions, /First 5 free/);
    assert.match(instructions, /looks_20 pack \(\$0\.20\)/);
    assert.match(instructions, /look \$0\.10 is optional one-shot/);
    assert.match(instructions, /look \/ looks_20 \/ addresses_100 \/ stamp_tx/);
    assert.match(instructions, /Merchants can require the stamp_tx \$0\.05 ticket before accepting agent USDC/);
    assert.match(instructions, /Take this ticket or we do not take your USDC/);
    assert.match(instructions, /meter_watch, then X-Agent-Pass/);
    assert.match(instructions, /We never take keys/);
    assert.match(instructions, /watch_url/);
    assert.match(instructions, /sign_exact/);
    assert.match(instructions, /adapter_snippet/);
    assert.match(instructions, /Sign USDC on your agent machine/);
    assert.match(instructions, /src\/adapters\/meter-pay-base\.ts/);
    assert.match(instructions, /Prefer Base EIP-3009 exact to base_pay_to/);
    const meterSlice = instructions.slice(instructions.indexOf("Agent Meter:"));
    assert.doesNotMatch(meterSlice, /\bhold\b/i);
    assert.doesNotMatch(meterSlice, /Inbox/);
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
    for (const tool of MCP_TOOLS) {
      assert.ok(tool.title, `${tool.name} needs a human title`);
      assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
      assert.equal(tool.annotations.destructiveHint, false);
    }
    assert.equal(MCP_TOOLS.find((tool) => tool.name === "get_pricing")?.annotations.readOnlyHint, true);
    assert.equal(MCP_TOOLS.find((tool) => tool.name === "check_transfer")?.annotations.readOnlyHint, false);
    const scan = MCP_TOOLS.find((tool) => tool.name === "meter_scan")?.description ?? "";
    const preflight = MCP_TOOLS.find((tool) => tool.name === "meter_preflight")?.description ?? "";
    assert.match(scan, /X-Agent-Pass/);
    assert.match(scan, /first 5 looks on that id are free/);
    assert.match(scan, /402 looks_20 pack \$0\.20/);
    assert.match(scan, /look \$0\.10 is optional one-shot/);
    assert.match(scan, /pay_page for Phantom laptop/);
    assert.match(scan, /no Solana key/);
    assert.match(preflight, /X-Agent-Pass/);
    assert.match(preflight, /first 5 looks on that id are free/);
    assert.match(preflight, /value_usd/);
    assert.match(preflight, /cap_usd/);
    const stamp = MCP_TOOLS.find((tool) => tool.name === "meter_stamp")?.description ?? "";
    const verify = MCP_TOOLS.find((tool) => tool.name === "meter_verify_stamp")?.description ?? "";
    assert.match(stamp, /stamp_tx \$0\.05/);
    assert.match(stamp, /Merchants can require the stamp_tx \$0\.05 ticket before accepting agent USDC/);
    assert.match(stamp, /meter_verify_stamp/);
    assert.match(verify, /Merchants can require the stamp_tx \$0\.05 ticket before accepting agent USDC/);
    assert.match(verify, /Take this ticket or we do not take your USDC/);
    assert.match(verify, /before you accept agent USDC/);
    assert.match(verify, /If verified is true and decision is allow/);
    assert.match(stamp, /Take this ticket or we do not take your USDC/);
    const buy = MCP_TOOLS.find((tool) => tool.name === "meter_buy_pass");
    const watch = MCP_TOOLS.find((tool) => tool.name === "meter_watch");
    assert.match(buy?.description ?? "", /ok:true \/ status payment_required/);
    assert.match(buy?.description ?? "", /payable invoice as tool content/);
    assert.match(buy?.description ?? "", /pay_to/);
    assert.match(buy?.description ?? "", /amount_base_units/);
    assert.match(buy?.description ?? "", /reference/);
    assert.match(buy?.description ?? "", /pay_url/);
    assert.match(buy?.description ?? "", /watch_url/);
    assert.match(buy?.description ?? "", /We never take keys/);
    assert.match(buy?.description ?? "", /then meter_watch/);
    assert.match(buy?.description ?? "", /adapter_url/);
    assert.match(buy?.description ?? "", /pay_page/);
    assert.match(buy?.description ?? "", /Prefer Base EIP-3009 exact to base_pay_to/);
    assert.match(buy?.description ?? "", /base_adapter_url/);
    assert.match(buy?.description ?? "", /sign_exact/);
    assert.match(buy?.description ?? "", /adapter_snippet/);
    assert.match(buy?.description ?? "", /tool_fields/);
    assert.match(buy?.description ?? "", /finish in-process/);
    assert.match(buy?.description ?? "", /next_steps/);
    assert.match(buy?.description ?? "", /no Solana key/);
    assert.match(buy?.description ?? "", /base_pay_to/);
    assert.match(buy?.description ?? "", /pay_page for Phantom laptop/);
    assert.doesNotMatch(buy?.description ?? "", /Copy src\/adapters\/meter-pay\.ts/);
    assert.doesNotMatch(buy?.description ?? "", /returns HTTP 402/i);
    assert.match(watch?.description ?? "", /invoice_id/);
    assert.match(watch?.description ?? "", /X-Agent-Pass/);
    assert.match(watch?.description ?? "", /We never take keys/);
    const schemas = JSON.stringify(MCP_TOOLS.map((tool) => tool.inputSchema));
    assert.doesNotMatch(schemas, /secret_key|secretKey|private_key|privateKey|base58_secret/);
    assert.equal(buy?.inputSchema.properties && "secret_key" in (buy.inputSchema.properties as object), false);
  });

  it("treats HTTP 402 invoices as MCP tool content and refuses secret keys", () => {
    const invoice = meter402Body({
      invoice_id: "inv_mcp",
      pay_to: "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR",
      reference: "ref_mcp",
      amount_usd: 0.10,
      amount_base_units: "100000",
      chain: "solana",
      asset: "usdc",
      sku: "look",
    });
    assert.equal(invoice.error, "payment_required");
    assert.equal(invoice.http, 402);

    const asContent = meterMcpToolResult(402, invoice);
    assert.equal(asContent.ok, true);
    if (!asContent.ok) return;
    const body = asContent.result as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal(body.status, "payment_required");
    assert.equal(body.sku, "look");
    assert.equal(body.price_usd, 0.10);
    assert.equal(body.asset, "usdc");
    assert.equal(body.chain, "solana");
    assert.equal(body.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.equal(body.amount_usd, 0.10);
    assert.equal(body.amount_base_units, "100000");
    assert.equal(body.invoice_id, "inv_mcp");
    assert.equal(body.reference, "ref_mcp");
    assert.equal(body.question, invoice.question);
    assert.equal(body.note, invoice.note);
    assert.equal(body.pay_url, invoice.pay_url);
    assert.equal(body.watch_url, "https://agent-control.net/api/v1/meter/watch");
    assert.equal(body.adapter_url, METER_ADAPTER_URL);
    assert.equal(body.base_adapter_url, METER_BASE_ADAPTER_URL);
    assert.equal(body.preferred_rail, "base");
    assert.equal(body.pay_page, meter402PayPage("inv_mcp"));
    assert.equal(body.next_tool, METER_NEXT_TOOL);
    assert.equal(body.sign, invoice.sign);
    assert.equal(body.next, invoice.next);
    assert.equal(body.next, meter402Next("inv_mcp"));
    assert.ok(Array.isArray(body.next_steps));
    assert.ok(Array.isArray(body.tool_fields));
    assert.equal((body.sign_exact as { pay_to: string }).pay_to, "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98");
    assert.match(String(body.adapter_snippet), /payMeterPassBase/);
    assert.match(String(body.sign), /buyMeterPass \/ payMeterPass/);
    assert.match(String(body.sign), /sign_exact/);
    assert.match(String(body.sign), /adapter_snippet/);
    assert.match(String(body.next), /meter_watch/);
    assert.match(String(body.next), /"invoice_id":"inv_mcp"/);
    assert.equal("error" in body, false);
    assert.equal("http" in body, false);
    const text = JSON.stringify(body);
    assert.match(text, /^\{"ok":true,"status":"payment_required"/);
    assert.doesNotMatch(text, /"error":/);
    assert.doesNotMatch(text, /"http":/);

    const minted = meterMcpToolResult(200, { token: "pass_abc", header: "X-Agent-Pass" });
    assert.equal(minted.ok, true);
    if (!minted.ok) return;
    assert.equal((minted.result as { token: string }).token, "pass_abc");
    assert.equal("ok" in (minted.result as object), false);

    const rejected = rejectMeterKeyUpload({ sku: "look", secret_key: "do-not-send" });
    assert.ok(rejected && !rejected.ok);
    assert.match(rejected.message, /We never take keys/);
    assert.equal(rejectMeterKeyUpload({ sku: "look", invoice_id: "inv_ok" }), null);

    const failed = meterMcpToolResult(400, { error: "bad_request" });
    assert.equal(failed.ok, false);
    if (failed.ok) return;
    assert.equal(failed.status, 400);
    assert.match(failed.message, /bad_request/);
  });

  it("defaults 402 status to payment_required and keeps extra invoice fields", () => {
    const reshaped = reshapeMeter402Invoice({
      sku: "looks_20",
      pay_to: "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR",
      kind: "scan",
      http: 402,
      adapter_url: METER_ADAPTER_URL,
      pay_page: meter402PayPage("inv_keep"),
      next_tool: METER_NEXT_TOOL,
      sign: "Sign USDC on YOUR machine to pay_to WITH the reference. Fetch adapter_url (buyMeterPass / payMeterPass). We never take keys.",
      next: meter402Next("inv_keep"),
    });
    assert.equal(reshaped.ok, true);
    assert.equal(reshaped.status, "payment_required");
    assert.equal(reshaped.sku, "looks_20");
    assert.equal(reshaped.kind, "scan");
    assert.equal(reshaped.adapter_url, METER_ADAPTER_URL);
    assert.equal(reshaped.pay_page, meter402PayPage("inv_keep"));
    assert.equal(reshaped.next_tool, "meter_watch");
    assert.equal(reshaped.next, meter402Next("inv_keep"));
    assert.match(String(reshaped.sign), /buyMeterPass/);
    assert.equal("error" in reshaped, false);
    assert.equal("http" in reshaped, false);
    const custom = meterMcpToolResult(402, { error: "payment_required", extra: "keep-me" });
    assert.equal(custom.ok, true);
    if (!custom.ok) return;
    const body = custom.result as { status: string; extra: string };
    assert.equal(body.status, "payment_required");
    assert.equal(body.extra, "keep-me");
  });

  it("meter_buy_pass MCP tool content is an ok payable invoice, not an error label", async () => {
    const store = createMeterStore();
    const httpRes = await handleMeterRequest(
      new Request("https://agent-control.net/api/v1/meter/pass", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: "look" }),
      }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(httpRes.status, 402);
    const invoice = (await httpRes.json()) as Record<string, unknown>;
    assert.equal(invoice.error, "payment_required");
    assert.equal(invoice.http, 402);
    assert.equal(invoice.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");

    const outcome = meterMcpToolResult(httpRes.status, invoice);
    const res = await handleMcpPost(
      post(jsonRpc("tools/call", { params: { name: "meter_buy_pass", arguments: { sku: "look" } } }), {
        Accept: "application/json",
      }),
      { callTool: async () => outcome },
    );
    assert.equal(res.status, 200);
    const rpc = (await res.json()) as { result: { content: { text: string }[] }; error?: unknown };
    assert.equal(rpc.error, undefined);
    const text = rpc.result.content[0]?.text ?? "";
    assert.match(text, /^\{"ok":true,"status":"payment_required"/);
    assert.doesNotMatch(text, /"error":/);
    assert.doesNotMatch(text, /"http":/);
    const body = JSON.parse(text) as {
      ok: boolean;
      status: string;
      sku: string;
      pay_to: string;
      amount_usd: number;
      amount_base_units: string;
      invoice_id: string;
      reference: string;
      pay_url: string;
      watch_url: string;
      adapter_url: string;
      base_adapter_url: string;
      preferred_rail: string;
      pay_page: string;
      next_tool: string;
      sign: string;
      next: string;
      next_steps: string[];
      tool_fields: string[];
      sign_exact: { pay_to: string; primaryType: string; watch: { invoice_id: string } };
      adapter_snippet: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.status, "payment_required");
    assert.equal(body.sku, "look");
    assert.equal(body.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.equal(body.amount_usd, 0.10);
    assert.equal(body.amount_base_units, "100000");
    assert.ok(body.invoice_id);
    assert.ok(body.reference);
    assert.match(body.pay_url, /solana:49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR/);
    assert.equal(body.watch_url, "https://agent-control.net/api/v1/meter/watch");
    assert.equal(body.adapter_url, METER_ADAPTER_URL);
    assert.equal(body.base_adapter_url, METER_BASE_ADAPTER_URL);
    assert.equal(body.preferred_rail, "base");
    assert.equal(body.pay_page, meter402PayPage(body.invoice_id));
    assert.equal(body.next_tool, "meter_watch");
    assert.match(body.next_steps[0] ?? "", /No Solana key needed/);
    assert.match(body.next_steps[0] ?? "", /sign_exact/);
    assert.deepEqual(body.tool_fields.includes("sign_exact"), true);
    assert.equal(body.sign_exact.pay_to, "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98");
    assert.equal(body.sign_exact.primaryType, "TransferWithAuthorization");
    assert.equal(body.sign_exact.watch.invoice_id, body.invoice_id);
    assert.match(body.adapter_snippet, /payMeterPassBase/);
    assert.match(body.sign, /buyMeterPass \/ payMeterPass/);
    assert.match(body.sign, /sign_exact/);
    assert.match(body.next, /meter_watch/);
    assert.match(body.next, /pay_page/);
    assert.match(body.next, new RegExp(`"invoice_id":"${body.invoice_id}"`));
    assert.match(body.next, /meter_scan/);
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

  it("advertises OAuth resource metadata on 401 without breaking Bearer keys", async () => {
    const missing = await handleMcpPost(
      post(jsonRpc("tools/call", { params: { name: "get_status", arguments: {} } }), {
        Accept: "application/json",
      }),
      {
        callTool: await pricingTool(),
        wwwAuthenticate:
          'Bearer realm="Agent Control", resource_metadata="https://agent-control.net/.well-known/oauth-protected-resource/api/v1/mcp"',
      },
    );
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("www-authenticate") ?? "", /oauth-protected-resource/);
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
    assert.match(discovery.auth, /Claude Connector OAuth/);
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
