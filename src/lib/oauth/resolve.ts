import { readApiKey } from "../server/http.ts";
import { isAccessToken, sha256Hex } from "./crypto.ts";
import type { OauthStore } from "./store.ts";

export type McpCredential = {
  apiKey: string;
  via: "oauth" | "api_key" | "none";
  userId?: string;
  agentId?: string;
};

export async function resolveMcpCredential(
  request: Request,
  store: OauthStore,
  now = Date.now(),
): Promise<McpCredential> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (bearer && isAccessToken(bearer)) {
    const token = await store.getToken(sha256Hex(bearer));
    if (!token || new Date(token.expires_at).getTime() <= now) {
      return { apiKey: "", via: "oauth" };
    }
    const agent = await store.getAgentForUser(token.user_id, token.agent_id);
    if (!agent?.api_key) return { apiKey: "", via: "oauth" };
    return {
      apiKey: agent.api_key,
      via: "oauth",
      userId: token.user_id,
      agentId: token.agent_id,
    };
  }
  const apiKey = readApiKey(request);
  if (!apiKey) return { apiKey: "", via: "none" };
  return { apiKey, via: "api_key" };
}
