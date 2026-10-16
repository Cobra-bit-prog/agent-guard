/**
 * Serves sitemap and agents discovery with live directory listings.
 * Runs before the static CDN files are stripped from the Vercel output;
 * in dev, vite.config.ts handles the same paths before public/.
 */
import { handleDirectoryCrawl } from "../../src/lib/directory/crawl-response.server.ts";

interface CrawlEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function directoryCrawlMiddleware(
  event: CrawlEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  const request = new Request(event.url, { method, headers: event.req.headers });
  const response = await handleDirectoryCrawl(request);
  if (response) return response;
  return next();
}
