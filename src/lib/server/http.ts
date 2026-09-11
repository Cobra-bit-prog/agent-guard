export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Api-Key, X-Helius-Secret, X-Agent-Pass",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, WWW-Authenticate",
};

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return Response.json(data, { status, headers: { ...CORS, ...extraHeaders } });
}

export function readApiKey(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return (request.headers.get("x-api-key") ?? "").trim();
}

/** Public origin for invoice pay_url / human_url. */
export function originFromRequest(request: Request): string {
  const env =
    process.env.PUBLIC_ORIGIN?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (env) {
    const origin = env.startsWith("http")
      ? env.replace(/\/$/, "")
      : `https://${env.replace(/\/$/, "")}`;
    return origin;
  }
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return "https://agent-control.net";
}
