import { auth, authConfigured } from "@/lib/auth/server";
import { gateIdentityEnabled } from "@/lib/auth/gate-identity.server";
import { DEV_USER_ID } from "@/lib/auth/verify.server";
import {
  authorizeQueryFromRecord,
  completeAuthorize,
  denyAuthorize,
} from "./protocol.ts";
import { issuerFromRequest, oauthJson, oauthRedirect, readOauthBody } from "./http.ts";
import { getOauthStore } from "./sql-store.ts";

function str(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

async function userIdFromRequest(request: Request): Promise<string | null> {
  if (!authConfigured && !gateIdentityEnabled()) {
    if (process.env.DATABASE_URL?.trim()) return null;
    return DEV_USER_ID;
  }
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

function authorizeCallback(body: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const key of [
    "response_type",
    "client_id",
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "scope",
    "resource",
  ]) {
    const value = str(body, key);
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/oauth/authorize?${qs}` : "/oauth/authorize";
}

export async function handleAuthorizePost(request: Request): Promise<Response> {
  const body = await readOauthBody(request);
  const query = authorizeQueryFromRecord({
    response_type: str(body, "response_type"),
    client_id: str(body, "client_id"),
    redirect_uri: str(body, "redirect_uri"),
    state: str(body, "state"),
    code_challenge: str(body, "code_challenge"),
    code_challenge_method: str(body, "code_challenge_method"),
    scope: str(body, "scope"),
    resource: str(body, "resource"),
  });
  if (str(body, "decision") !== "allow") {
    const denied = denyAuthorize(query, issuerFromRequest(request));
    if (denied.redirect) return oauthRedirect(denied.redirect);
    return oauthJson(denied.body, denied.status);
  }
  const userId = await userIdFromRequest(request);
  if (!userId) {
    return oauthRedirect(`/login?callbackURL=${encodeURIComponent(authorizeCallback(body))}`);
  }
  const store = await getOauthStore();
  const result = await completeAuthorize(store, {
    query,
    userId,
    agentId: str(body, "agent_id"),
    issuer: issuerFromRequest(request),
  });
  if (result.redirect) return oauthRedirect(result.redirect);
  return oauthJson(result.body, result.status);
}
