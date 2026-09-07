import { agentStatusForKey, checkTransferIntent, pollApprovalIntent } from "@/lib/server/intent";
import { dispatchStorefrontTool } from "@/lib/server/storefront";
import type { McpToolCallResult } from "@/lib/mcp/handle.ts";

export async function dispatchMcpTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<McpToolCallResult> {
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
