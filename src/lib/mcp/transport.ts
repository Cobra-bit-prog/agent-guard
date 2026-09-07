export const MCP_SESSION_HEADER = "Mcp-Session-Id";
export const MCP_PROTOCOL_HEADER = "MCP-Protocol-Version";

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Api-Key, Accept, Mcp-Session-Id, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Session-Id",
};

export type JsonRpcId = string | number | null;

export type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

export type McpResponseMode = "sse" | "json";

const VISIBLE_ASCII = /^[\x21-\x7E]+$/;

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function isValidSessionId(value: string): boolean {
  return value.length >= 8 && value.length <= 128 && VISIBLE_ASCII.test(value);
}

export function readSessionId(request: Request): string | null {
  const raw = request.headers.get("mcp-session-id")?.trim() ?? "";
  return raw || null;
}

export function acceptTokens(header: string): string[] {
  return header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase() ?? "")
    .filter(Boolean);
}

/** Prefer SSE whenever the client advertises text/event-stream (official Streamable HTTP Accept). */
export function responseMode(acceptHeader: string | null): McpResponseMode {
  const tokens = acceptTokens(acceptHeader ?? "");
  if (tokens.includes("text/event-stream")) return "sse";
  return "json";
}

export function negotiateProtocolVersion(requested: unknown): string {
  if (
    typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

export function protocolVersionHeaderUnsupported(header: string | null): boolean {
  const value = header?.trim() ?? "";
  if (!value) return false;
  return !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value);
}

/**
 * Spec: if Origin is present and invalid, respond 403.
 * Missing Origin is allowed (agents, curl). Any parseable http(s) Origin is allowed
 * on this public hosted endpoint.
 */
export function originIsInvalid(origin: string | null): boolean {
  if (origin === null || origin === "" || origin === "null") return false;
  try {
    const url = new URL(origin);
    return url.protocol !== "http:" && url.protocol !== "https:";
  } catch {
    return true;
  }
}

export function encodeSseMessage(payload: unknown, eventId?: string): string {
  const data = JSON.stringify(payload);
  const idLine = eventId ? `id: ${eventId}\n` : "";
  return `${idLine}event: message\ndata: ${data}\n\n`;
}

export function parseSseJsonRpc(body: string): unknown {
  const data = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) throw new Error("SSE frame is missing a data field.");
  return JSON.parse(data) as unknown;
}

export function sseEventName(body: string): string | null {
  const line = body.split(/\r?\n/).find((row) => row.startsWith("event:"));
  return line ? line.slice(6).trim() : null;
}

export function mcpTransportHeaders(sessionId?: string | null): Record<string, string> {
  const headers: Record<string, string> = { ...MCP_CORS };
  if (sessionId) headers[MCP_SESSION_HEADER] = sessionId;
  return headers;
}

export function mcpRpcResponse(opts: {
  accept: string | null;
  status: number;
  body: unknown;
  sessionId?: string | null;
}): Response {
  const headers = mcpTransportHeaders(opts.sessionId);
  if (responseMode(opts.accept) === "sse") {
    return new Response(encodeSseMessage(opts.body, crypto.randomUUID()), {
      status: opts.status,
      headers: {
        ...headers,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }
  return Response.json(opts.body, { status: opts.status, headers });
}

export function mcpAccepted(sessionId?: string | null): Response {
  return new Response(null, { status: 202, headers: mcpTransportHeaders(sessionId) });
}

export function isJsonRpcNotification(msg: JsonRpcMessage): boolean {
  if (typeof msg.method !== "string" || !msg.method) return false;
  if (msg.method.startsWith("notifications/")) return true;
  return !Object.prototype.hasOwnProperty.call(msg, "id");
}

export function isJsonRpcResponse(msg: JsonRpcMessage): boolean {
  if (typeof msg.method === "string") return false;
  return Object.prototype.hasOwnProperty.call(msg, "result") ||
    Object.prototype.hasOwnProperty.call(msg, "error");
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
