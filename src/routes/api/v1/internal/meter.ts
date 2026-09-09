import { createFileRoute } from "@tanstack/react-router";
import { CORS, json } from "@/lib/server/http";
import { authorizeInternalStats } from "@/lib/server/stats.server";
import { collectMeterSqlReport } from "@/lib/meter/sql-store";
import { meterFundsDestination } from "@/lib/meter/settle";

export const Route = createFileRoute("/api/v1/internal/meter")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const auth = authorizeInternalStats(request);
        if (auth === "missing") return json({ error: "Not found" }, 404);
        if (auth !== "ok") return json({ error: "Unauthorized" }, 401);
        return json({
          ...(await collectMeterSqlReport()),
          funds: meterFundsDestination(),
        });
      },
    },
  },
});
