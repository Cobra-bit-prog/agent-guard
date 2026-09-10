import { readApiKey } from "../server/http.ts";
import { json } from "../server/http.ts";
import { MCP_TOOLS, mcpDiscovery } from "./tools.ts";
import {
  acceptTokens,
  asRecord,
  generateSessionId,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isValidSessionId,
  mcpAccepted,
  mcpRpcResponse,
  mcpTransportHeaders,
  negotiateProtocolVersion,
  originIsInvalid,
  protocolVersionHeaderUnsupported,
  readSessionId,
  type JsonRpcId,
  type JsonRpcMessage,
} from "./transport.ts";

export type McpToolCallResult =
  | { ok: true; result: unknown }
  | { ok: false; status: number; code: number; message: string };

export type McpCallTool = (
  name: string,
  args: Record<string, unknown>,
  apiKey: string,
) => Promise<McpToolCallResult>;

const SERVER_INFO = { name: "Agent Control", version: "1.0.0" } as const;

const INSTRUCTIONS =
  "Human App: call check_transfer before a send (Bearer agent API key). Agent Meter: meter_pricing / meter_buy_pass / meter_watch / meter_scan / meter_preflight / meter_scan_batch / meter_stamp / meter_verify_stamp with no email — pay a pass, then meter_watch, then X-Agent-Pass. get_pricing is public. You keep the keys.";

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function toolContent(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function initializeResult(requested: unknown) {
  return {
    protocolVersion: negotiateProtocolVersion(requested),
    serverInfo: SERVER_INFO,
    capabilities: { tools: {} },
    instructions: INSTRUCTIONS,
  };
}

export async function handleMcpPost(
  request: Request,
  deps: { callTool: McpCallTool },
): Promise<Response> {
  const accept = request.headers.get("accept");

  if (originIsInvalid(request.headers.get("origin"))) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Invalid Origin." }, id: null }),
      { status: 403, headers: { ...mcpTransportHeaders(), "Content-Type": "application/json" } },
    );
  }

  if (protocolVersionHeaderUnsupported(request.headers.get("mcp-protocol-version"))) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32602, message: "Unsupported MCP-Protocol-Version." },
        id: null,
      }),
      { status: 400, headers: { ...mcpTransportHeaders(), "Content-Type": "application/json" } },
    );
  }

  let msg: JsonRpcMessage = {};
  try {
    const parsed: unknown = await request.json();
    if (Array.isArray(parsed)) {
      return mcpRpcResponse({
        accept,
        status: 400,
        body: { jsonrpc: "2.0", error: { code: -32600, message: "JSON-RPC batch is not supported." }, id: null },
      });
    }
    if (!parsed || typeof parsed !== "object") {
      return Response.json({ error: "JSON-RPC body required." }, { status: 400, headers: mcpTransportHeaders() });
    }
    msg = parsed as JsonRpcMessage;
  } catch {
    return Response.json({ error: "JSON-RPC body required." }, { status: 400, headers: mcpTransportHeaders() });
  }

  const method = typeof msg.method === "string" ? msg.method : "";
  const incomingSession = readSessionId(request);
  const isInitialize = method === "initialize";

  if (incomingSession && !isValidSessionId(incomingSession)) {
    return mcpRpcResponse({
      accept,
      status: 404,
      body: rpcError(msg.id ?? null, -32001, "Unknown MCP session."),
    });
  }

  const sessionId = isInitialize ? generateSessionId() : incomingSession;

  if (isJsonRpcResponse(msg) || isJsonRpcNotification(msg)) {
    return mcpAccepted(sessionId);
  }

  const id: JsonRpcId = msg.id ?? 1;
  const params = asRecord(msg.params);

  if (method === "initialize") {
    return mcpRpcResponse({
      accept,
      status: 200,
      sessionId,
      body: rpcResult(id, initializeResult(params.protocolVersion)),
    });
  }

  if (method === "ping") {
    return mcpRpcResponse({ accept, status: 200, sessionId, body: rpcResult(id, {}) });
  }

  if (method === "tools/list" || method === "list_tools") {
    return mcpRpcResponse({
      accept,
      status: 200,
      sessionId,
      body: rpcResult(id, { tools: MCP_TOOLS }),
    });
  }

  if (method === "resources/list") {
    return mcpRpcResponse({ accept, status: 200, sessionId, body: rpcResult(id, { resources: [] }) });
  }

  if (method === "prompts/list") {
    return mcpRpcResponse({ accept, status: 200, sessionId, body: rpcResult(id, { prompts: [] }) });
  }

  if (method === "tools/call" || method === "call_tool") {
    const name = typeof params.name === "string" ? params.name : "";
    const args = asRecord(params.arguments);
    const apiKey = readApiKey(request);
    const outcome = await deps.callTool(name, args, apiKey);
    if (!outcome.ok) {
      return mcpRpcResponse({
        accept,
        status: outcome.status,
        sessionId,
        body: rpcError(id, outcome.code, outcome.message),
      });
    }
    return mcpRpcResponse({
      accept,
      status: 200,
      sessionId,
      body: rpcResult(id, toolContent(outcome.result)),
    });
  }

  return mcpRpcResponse({
    accept,
    status: 400,
    sessionId,
    body: rpcError(id, -32601, "Unknown method."),
  });
}

export function handleMcpDelete(request: Request): Response {
  if (originIsInvalid(request.headers.get("origin"))) {
    return new Response(null, { status: 403, headers: mcpTransportHeaders() });
  }
  const session = readSessionId(request);
  if (!session) {
    return new Response(null, { status: 400, headers: mcpTransportHeaders() });
  }
  if (!isValidSessionId(session)) {
    return new Response(null, { status: 404, headers: mcpTransportHeaders() });
  }
  return new Response(null, { status: 200, headers: mcpTransportHeaders(session) });
}

export function handleMcpOptions(): Response {
  return new Response(null, { status: 204, headers: mcpTransportHeaders() });
}

/** Keep JSON discovery for existing clients. Official listen GETs get 405 — no GET SSE stream. */
export function handleMcpGet(request: Request): Response {
  const tokens = acceptTokens(request.headers.get("accept") ?? "");
  if (tokens.includes("text/event-stream") && !tokens.includes("application/json")) {
    return new Response(null, {
      status: 405,
      headers: { ...mcpTransportHeaders(), Allow: "GET, POST, DELETE, OPTIONS" },
    });
  }
  return json(mcpDiscovery());
}

export { SERVER_INFO };
