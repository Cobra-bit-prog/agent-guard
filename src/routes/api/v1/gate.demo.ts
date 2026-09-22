import { createFileRoute } from "@tanstack/react-router";
import { handleStampGateRequest } from "@/lib/meter/gate";
import { CORS } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/gate/demo")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: ({ request }) => handleStampGateRequest(request),
      POST: ({ request }) => handleStampGateRequest(request),
    },
  },
});
