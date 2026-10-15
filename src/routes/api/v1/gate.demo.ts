import { createFileRoute } from "@tanstack/react-router";
import { withPaymentAskLog } from "@/lib/payment-ask/route";
import { handleStampGateRequest } from "@/lib/meter/gate";
import { CORS } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/gate/demo")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: withPaymentAskLog("/api/v1/gate/demo", ({ request }) => handleStampGateRequest(request)),
      POST: withPaymentAskLog("/api/v1/gate/demo", ({ request }) =>
        handleStampGateRequest(request),
      ),
    },
  },
});
