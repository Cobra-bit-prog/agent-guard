// Soft-accept for TanStack Start document/SSR routes.
//
// createStartHandler.executeRouter returns HTTP 500 JSON
// `{ error: "Only HTML requests are supported here" }` when Accept has no
// text/html or wildcard token. Scrapers that send MCP-style
// `application/json, text/event-stream` (or JSON-only) hit `/`, `/docs`,
// `/___server`, well-known and registry JSON paths, etc. and spike Vercel 5xx.
//
// Global Start request middleware cannot rewrite Accept (executeRouter reads
// the original Request). Nitro/Vite middleware that returns 406 before Start
// runs is the reliable equivalent: page routes never 500.
//
// API routes (`/api/...`), including Streamable HTTP `/api/v1/mcp`, are skipped.

/** Same negotiation as @tanstack/start-server-core createStartHandler. */
export function acceptAllowsHtml(accept) {
  const header = String(accept ?? "").trim() || "*/*";
  return header.split(",").some((part) => {
    const mime = part.trim();
    return mime.startsWith("text/html") || mime.startsWith("*/*");
  });
}

export function isApiPath(pathname) {
  const path = String(pathname ?? "");
  return path === "/api" || path.startsWith("/api/");
}

/**
 * True when a request would otherwise fall through to Start HTML SSR and 500.
 * GET/HEAD only so POST server-function / RPC traffic is untouched.
 */
export function shouldSoftReject({ method, pathname, accept }) {
  const verb = String(method ?? "GET").toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return false;
  const path = String(pathname ?? "");
  if (isApiPath(path)) return false;
  if (path === "/__grok" || path.startsWith("/__grok/")) return false;
  return !acceptAllowsHtml(accept);
}

export const NOT_ACCEPTABLE_BODY = JSON.stringify({ error: "Not Acceptable" });

export function notAcceptableHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    vary: "Accept",
  };
}

export function notAcceptableResponse() {
  return new Response(NOT_ACCEPTABLE_BODY, {
    status: 406,
    headers: notAcceptableHeaders(),
  });
}
