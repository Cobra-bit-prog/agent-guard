import type { ListingQuery } from "../directory/listings.ts";
import type { McpToolCallResult } from "../mcp/handle.ts";
import { handleAgentCheckRequest } from "./http.ts";

/** Free MCP tool. Same checks as POST /api/v1/agent-check. */
export async function runAgentReadinessCheckTool(
  args: Record<string, unknown>,
  headers: { get(name: string): string | null } | undefined,
  sql: ListingQuery | null,
): Promise<McpToolCallResult> {
  const requestHeaders = new Headers({ "content-type": "application/json" });
  if (headers) {
    for (const name of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]) {
      const value = headers.get(name);
      if (value) requestHeaders.set(name, value);
    }
  }
  const request = new Request("https://agent-control.net/api/v1/agent-check", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({ url: args.url ?? args.site }),
  });
  const response = await handleAgentCheckRequest(request, sql);
  const payload = (await response.json().catch(() => ({ error: "Could not run this check." }))) as {
    error?: string;
  };
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: response.status,
      message: payload.error || "Could not run this check.",
    };
  }
  return { ok: true, result: payload };
}
