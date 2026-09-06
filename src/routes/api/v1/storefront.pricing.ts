import { createFileRoute } from "@tanstack/react-router";
import { CORS, json } from "@/lib/server/http";
import { getPricing } from "@/lib/storefront";

export const Route = createFileRoute("/api/v1/storefront/pricing")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () => json(getPricing()),
    },
  },
});
