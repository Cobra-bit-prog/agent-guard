import { agentStatusForKey, checkTransferIntent, pollApprovalIntent } from "@/lib/server/intent";
import { dispatchStorefrontTool } from "@/lib/server/storefront";
import type { McpToolCallResult } from "@/lib/mcp/handle.ts";
import { handleMeterRequest } from "@/lib/meter/http";

async function meterTool(
  path: string,
  method: "GET" | "POST",
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const headers = new Headers({ "content-type": "application/json" });
  if (typeof args.pass_token === "string" && args.pass_token) {
    headers.set("X-Agent-Pass", args.pass_token);
  }
  const request = new Request(`https://agent-control.net${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(args) : undefined,
  });
  const res = await handleMeterRequest(request, path);
  const payload = await res.json().catch(() => ({ error: "meter_parse" }));
  if (res.status >= 400) {
    return {
      ok: false,
      status: res.status,
      code: res.status,
      message: typeof payload === "object" ? JSON.stringify(payload) : String(payload),
    };
  }
  return { ok: true, result: payload };
}

export async function dispatchMcpTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<McpToolCallResult> {
  if (name === "meter_pricing") return meterTool("/api/v1/meter/pricing", "GET", args);
  if (name === "meter_buy_pass") return meterTool("/api/v1/meter/pass", "POST", args);
  if (name === "meter_watch") return meterTool("/api/v1/meter/watch", "POST", args);
  if (name === "meter_scan") return meterTool("/api/v1/meter/scan", "POST", args);
  if (name === "meter_preflight") return meterTool("/api/v1/meter/preflight", "POST", args);

  const storefront = await dispatchStorefrontTool(name, args, apiKey);
  if (storefront) {
    if (!storefront.ok) {
      return {
        ok: false,
        status: storefront.status,
        code: storefront.status,
        message: storefront.error,
      };
    }
    return { ok: true, result: storefront.result };
  }

  if (name === "get_agent_status") {
    const status = await agentStatusForKey(apiKey);
    if (!status) {
      return { ok: false, status: 401, code: 401, message: "Unknown API key." };
    }
    return { ok: true, result: status };
  }

  if (name === "check_transfer") {
    const result = await checkTransferIntent({
      apiKey,
      to: String(args.to ?? ""),
      valueUsd: Number(args.value_usd ?? args.valueUsd ?? 0),
    });
    if (!result.ok) {
      return { ok: false, status: result.status, code: result.status, message: result.error };
    }
    return { ok: true, result: result.result };
  }

  if (name === "get_approval") {
    const result = await pollApprovalIntent({
      apiKey,
      approvalId: String(args.approval_id ?? ""),
    });
    if (!result.ok) {
      return { ok: false, status: result.status, code: result.status, message: result.error };
    }
    return { ok: true, result: result.result };
  }

  return { ok: false, status: 400, code: -32601, message: "Unknown tool." };
}
