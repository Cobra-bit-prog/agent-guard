import { createFileRoute } from "@tanstack/react-router";
import { hireCatalogResponse, postHireOrder } from "@/lib/hire/handle";
import { CORS } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/hire")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () => hireCatalogResponse(),
      POST: async ({ request }) => postHireOrder(request),
    },
  },
});
