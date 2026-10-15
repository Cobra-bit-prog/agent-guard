import { createFileRoute } from "@tanstack/react-router";
import { withPaymentAskLog } from "@/lib/payment-ask/route";
import { CORS } from "@/lib/server/http";
import { handleMeterRequest } from "@/lib/meter/http";

export const Route = createFileRoute("/api/v1/meter/$")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      HEAD: ({ request }) => handleMeterRequest(request, new URL(request.url).pathname),
      GET: withPaymentAskLog("/api/v1/meter", ({ request }) =>
        handleMeterRequest(request, new URL(request.url).pathname),
      ),
      POST: withPaymentAskLog("/api/v1/meter", ({ request }) =>
        handleMeterRequest(request, new URL(request.url).pathname),
      ),
    },
  },
});
