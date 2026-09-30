import { createFileRoute } from "@tanstack/react-router";
import { handleShop } from "@/lib/meter/shop";
import { getDefaultMeterStore } from "@/lib/meter/sql-store";
import { CORS } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/shop")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => handleShop(request, await getDefaultMeterStore()),
      POST: async ({ request }) => handleShop(request, await getDefaultMeterStore()),
    },
  },
});
