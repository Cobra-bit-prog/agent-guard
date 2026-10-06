import { createFileRoute } from "@tanstack/react-router";
import { confirmPaidHire } from "@/lib/hire/handle";
import { CORS } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/hire/confirm")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => confirmPaidHire(request),
    },
  },
});
