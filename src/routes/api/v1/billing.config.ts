import { createFileRoute } from "@tanstack/react-router";
import { CORS, json } from "@/lib/server/http";
import { publicCheckoutConfig } from "@/lib/server/billing-core.server";

export const Route = createFileRoute("/api/v1/billing/config")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => json(publicCheckoutConfig()),
    },
  },
});
