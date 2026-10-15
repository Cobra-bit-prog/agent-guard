import { createFileRoute } from "@tanstack/react-router";
import { withPaymentAskLog } from "@/lib/payment-ask/route";
import { getSql } from "@/lib/db";
import { CORS } from "@/lib/server/http";
import { handleX402ReportRequest } from "@/lib/x402-check/http";

async function sqlOrNull() {
  try {
    return await getSql();
  } catch (err) {
    console.error("[x402-check] database unavailable", err instanceof Error ? err.name : "error");
    return null;
  }
}

export const Route = createFileRoute("/api/v1/x402-check/report")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: withPaymentAskLog("/api/v1/x402-check/report", async ({ request }) =>
        handleX402ReportRequest(request, await sqlOrNull()),
      ),
      POST: withPaymentAskLog(
        "/api/v1/x402-check/report",
        async ({ request }) => handleX402ReportRequest(request, await sqlOrNull()),
        { createsCheckout: true },
      ),
    },
  },
});
