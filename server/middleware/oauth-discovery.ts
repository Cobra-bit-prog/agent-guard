/**
 * Nitro (deployed) OAuth discovery for Claude Connectors.
 * Vite dev uses the plugin in vite.config.ts — this file is production only.
 */
import { handleOauthDiscovery } from "../../src/lib/oauth/http.ts";

interface DiscoveryEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function oauthDiscoveryMiddleware(
  event: DiscoveryEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  const request = new Request(event.url, { method, headers: event.req.headers });
  const handled = handleOauthDiscovery(request);
  if (handled) return handled;
  return next();
}
