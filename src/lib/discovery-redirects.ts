/**
 * Dead discovery URLs that still bounce agents and humans.
 * Same table is mirrored in vercel.json so Vercel edge and the app agree.
 *
 * /meter is a temporary soft bounce until the owner merges PR #43
 * (visualize). Do not implement that page here.
 */

export const LLMS_TXT_PATH = "/llms.txt";
export const LLMS_WELL_KNOWN_PATH = "/.well-known/llms.txt";

export const DISCOVERY_REDIRECTS = [
  {
    source: "/docs/connect",
    destination: "/connect",
    status: 308,
    permanent: true,
  },
  {
    source: "/pay",
    destination: "/billing/pay",
    status: 308,
    permanent: true,
  },
  {
    source: "/meter",
    destination: "/connect#agent-meter",
    status: 307,
    permanent: false,
  },
  {
    source: LLMS_WELL_KNOWN_PATH,
    destination: LLMS_TXT_PATH,
    status: 308,
    permanent: true,
  },
] as const;

const BY_SOURCE = new Map(DISCOVERY_REDIRECTS.map((rule) => [rule.source, rule]));

const WELL_KNOWN_REDIRECT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Agent-Pass",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Cache-Control": "public, max-age=3600",
} as const;

export function isDiscoveryRedirectPath(pathname: string): boolean {
  return BY_SOURCE.has(pathname);
}

/** Put the query string before any hash fragment. */
export function locationWithSearch(destination: string, search: string): string {
  if (!search || search === "?") return destination;
  const query = search.startsWith("?") ? search : `?${search}`;
  const hashAt = destination.indexOf("#");
  if (hashAt === -1) return `${destination}${query}`;
  return `${destination.slice(0, hashAt)}${query}${destination.slice(hashAt)}`;
}

export function handleDiscoveryRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const rule = BY_SOURCE.get(url.pathname);
  if (!rule) return null;

  const method = request.method.toUpperCase();
  const wellKnown = url.pathname.startsWith("/.well-known/");
  const extra = wellKnown ? WELL_KNOWN_REDIRECT_HEADERS : undefined;

  if (method === "OPTIONS" && wellKnown) {
    return new Response(null, { status: 204, headers: extra });
  }

  const location = locationWithSearch(rule.destination, url.search);
  return new Response(null, {
    status: rule.status,
    headers: {
      ...extra,
      Location: location,
    },
  });
}
