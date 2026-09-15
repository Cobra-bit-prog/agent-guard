import type { McpToolCallResult } from "./handle.ts";

/** Keys stay on the agent machine. Never accept a Solana secret on this server. */
export const REJECTED_METER_KEY_ARGS = new Set([
  "secret_key",
  "secretKey",
  "private_key",
  "privateKey",
  "base58_secret",
  "base58Secret",
]);

export function rejectMeterKeyUpload(args: Record<string, unknown>): McpToolCallResult | null {
  for (const key of Object.keys(args)) {
    if (!REJECTED_METER_KEY_ARGS.has(key)) continue;
    return {
      ok: false,
      status: 400,
      code: 400,
      message: "We never take keys. Sign USDC on your agent machine. Copy src/adapters/meter-pay.ts.",
    };
  }
  return null;
}

function asMeterPayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { error: "meter_parse" };
}

/** HTTP 402 labels stay on the HTTP door. MCP tool text must look like a payable challenge. */
export function reshapeMeter402Invoice(body: Record<string, unknown>): Record<string, unknown> {
  const invoice: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "error" || key === "http") continue;
    invoice[key] = value;
  }
  const error = body.error;
  return {
    ok: true,
    status: typeof error === "string" && error ? error : "payment_required",
    ...invoice,
  };
}

/** HTTP 402 is the invoice. MCP tools must return it as content, not a transport error. */
export function meterMcpToolResult(status: number, payload: unknown): McpToolCallResult {
  const body = asMeterPayload(payload);
  if (status === 402) {
    return { ok: true, result: reshapeMeter402Invoice(body) };
  }
  if (status >= 400) {
    return {
      ok: false,
      status,
      code: status,
      message: JSON.stringify(body),
    };
  }
  return { ok: true, result: body };
}
