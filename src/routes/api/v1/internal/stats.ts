import { createFileRoute } from "@tanstack/react-router";
import { CORS, json } from "@/lib/server/http";
import { getSql } from "@/lib/db";
import {
  authorizeInternalStats,
  collectAccountStats,
  emailAccountStats,
} from "@/lib/server/stats.server";

export const Route = createFileRoute("/api/v1/internal/stats")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const auth = authorizeInternalStats(request);
        if (auth === "missing") return json({ error: "Not found" }, 404);
        if (auth !== "ok") return json({ error: "Unauthorized" }, 401);
        const sql = await getSql();
        const stats = await collectAccountStats(sql);
        if (request.headers.get("x-vercel-cron") === "1") {
          try {
            await emailAccountStats(stats);
          } catch (err) {
            console.error("[stats] report email failed", err);
          }
        }
        return json(stats);
      },
    },
  },
});
