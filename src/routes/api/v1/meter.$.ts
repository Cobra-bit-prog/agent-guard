import { createFileRoute } from "@tanstack/react-router";
import { CORS } from "@/lib/server/http";
import { handleMeterRequest } from "@/lib/meter/http";

export const Route = createFileRoute("/api/v1/meter/$")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: ({ request }) => handleMeterRequest(request, new URL(request.url).pathname),
      POST: ({ request }) => handleMeterRequest(request, new URL(request.url).pathname),
    },
  },
});
