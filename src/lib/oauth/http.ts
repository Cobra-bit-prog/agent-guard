import { originFromRequest } from "../server/http.ts";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata.ts";

export const OAUTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function oauthJson(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return Response.json(body, {
    status,
    headers: { ...OAUTH_CORS, ...extra, "Content-Type": "application/json" },
  });
}

export function oauthRedirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...OAUTH_CORS, Location: location },
  });
}

export async function readOauthBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed: unknown = await request.json().catch(() => ({}));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  }
  const text = await request.text();
  const params = new URLSearchParams(text);
  const out: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

export function issuerFromRequest(request: Request): string {
  const override = process.env.OAUTH_ISSUER?.trim();
  if (override) {
    return override.startsWith("http")
      ? override.replace(/\/$/, "")
      : `https://${override.replace(/\/$/, "")}`;
  }
  return originFromRequest(request);
}

const AS_PATH = "/.well-known/oauth-authorization-server";
const PR_PATH = "/.well-known/oauth-protected-resource";
const PR_MCP_PATH = "/.well-known/oauth-protected-resource/api/v1/mcp";

export function isOauthDiscoveryPath(pathname: string): boolean {
  return pathname === AS_PATH || pathname === PR_PATH || pathname === PR_MCP_PATH;
}

export function handleOauthDiscovery(request: Request): Response | null {
  const url = new URL(request.url);
  if (!isOauthDiscoveryPath(url.pathname)) return null;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: OAUTH_CORS });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return oauthJson({ error: "method_not_allowed" }, 405);
  }
  const issuer = issuerFromRequest(request);
  const body =
    url.pathname === AS_PATH
      ? authorizationServerMetadata(issuer)
      : protectedResourceMetadata(issuer);
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: { ...OAUTH_CORS, "Content-Type": "application/json" } });
  }
  return oauthJson(body);
}
