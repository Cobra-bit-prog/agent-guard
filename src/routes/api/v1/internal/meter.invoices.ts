import { createFileRoute } from "@tanstack/react-router";
import { CORS } from "@/lib/server/http";
import { handleInternalMeterInvoices } from "@/lib/meter/http";

export const Route = createFileRoute("/api/v1/internal/meter/invoices")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: ({ request }) => handleInternalMeterInvoices(request),
    },
  },
});
