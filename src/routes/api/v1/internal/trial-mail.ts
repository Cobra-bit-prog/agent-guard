import { createFileRoute } from "@tanstack/react-router";
import { CORS, json } from "@/lib/server/http";
import { getSql } from "@/lib/db";
import { authorizeInternalStats } from "@/lib/server/stats.server";
import { sendDueTrialEndingEmails } from "@/lib/server/trial-mail.server";
import { ensureSchema } from "@/lib/server/guard";

export const Route = createFileRoute("/api/v1/internal/trial-mail")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const auth = authorizeInternalStats(request);
        if (auth === "missing") return json({ error: "Not found" }, 404);
        if (auth !== "ok") return json({ error: "Unauthorized" }, 401);
        await ensureSchema();
        const sql = await getSql();
        const result = await sendDueTrialEndingEmails(sql);
        return json({ ok: true, ...result });
      },
    },
  },
});
