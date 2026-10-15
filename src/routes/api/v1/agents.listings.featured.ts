import { createFileRoute } from "@tanstack/react-router";
import { withPaymentAskLog } from "@/lib/payment-ask/route";
import { getSql } from "@/lib/db";
import { handleFeaturedRequest } from "@/lib/directory/featured-http";
import { CORS } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/agents/listings/featured")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const sql = await getSql();
        return handleFeaturedRequest(request, sql);
      },
      POST: withPaymentAskLog(
        "/api/v1/agents/listings/featured",
        async ({ request }) => {
          const sql = await getSql();
          return handleFeaturedRequest(request, sql);
        },
        { createsCheckout: true },
      ),
    },
  },
});
