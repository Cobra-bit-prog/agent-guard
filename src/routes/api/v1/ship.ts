import { createFileRoute } from "@tanstack/react-router";
import { postShipOrder, shipCatalogResponse } from "@/lib/ship/handle";
import { CORS } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/ship")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () => shipCatalogResponse(),
      POST: async ({ request }) => postShipOrder(request),
    },
  },
});
