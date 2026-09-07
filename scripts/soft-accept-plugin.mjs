/**
 * Dev/preview (Vite) half of document-route soft-accept. Production Nitro half
 * lives in server/middleware/soft-accept.ts; both share scripts/soft-accept.mjs.
 *
 * Must register before TanStack Start so JSON/SSE Accept never reaches
 * executeRouter (500 "Only HTML requests are supported here").
 */
import { NOT_ACCEPTABLE_BODY, notAcceptableHeaders, shouldSoftReject } from "./soft-accept.mjs";

function sendNotAcceptable(res) {
  const body = Buffer.from(NOT_ACCEPTABLE_BODY, "utf8");
  const headers = notAcceptableHeaders();
  res.statusCode = 406;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.setHeader("content-length", String(body.byteLength));
  res.end(body);
}

function serveSoftAccept(middlewares) {
  middlewares.use((req, res, next) => {
    const pathOnly = (req.url ?? "").split("?", 1)[0] ?? "";
    if (
      shouldSoftReject({
        method: req.method,
        pathname: pathOnly,
        accept: req.headers.accept,
      })
    ) {
      sendNotAcceptable(res);
      return;
    }
    next();
  });
}

export function softAcceptPlugin() {
  return {
    name: "app-builder:soft-accept",
    configureServer(server) {
      serveSoftAccept(server.middlewares);
    },
    configurePreviewServer(server) {
      serveSoftAccept(server.middlewares);
    },
  };
}
