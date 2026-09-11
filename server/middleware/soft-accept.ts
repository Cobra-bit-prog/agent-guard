/**
 * Deployed-app (Nitro) half of document-route soft-accept. Auto-registered
 * because vite.config.ts sets `serverDir: "./server"`.
 *
 * TanStack Start page SSR 500s when Accept has no text/html (or wildcard).
 * Return 406 here so those requests never reach executeRouter. /api/* is skipped.
 */
import {
  isMcpWrongPath,
  mcpWrongPathResponse,
  notAcceptableResponse,
  shouldSoftReject,
} from "../../scripts/soft-accept.mjs";

interface SoftAcceptEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function softAcceptMiddleware(
  event: SoftAcceptEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if (isMcpWrongPath(event.url.pathname)) {
    return mcpWrongPathResponse();
  }
  if (
    shouldSoftReject({
      method: event.req.method,
      pathname: event.url.pathname,
      accept: event.req.headers.get("accept"),
    })
  ) {
    return notAcceptableResponse();
  }
  return next();
}
