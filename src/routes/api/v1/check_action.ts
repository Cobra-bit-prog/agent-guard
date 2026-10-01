import { createFileRoute } from "@tanstack/react-router";
import { ACTION_GATE_DB_ENV, ACTION_GATE_MCP_NOTE, ACTION_GATE_SCHEMA } from "@/lib/action-gate";
import { checkActionIntent } from "@/lib/server/action-gate";
import { CORS, json, readApiKey } from "@/lib/server/http";

export const Route = createFileRoute("/api/v1/check_action")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () =>
        json({
          usage: "POST /api/v1/check_action with Authorization: Bearer <agent api key>",
          body: {
            action_type: "email.send",
            summary: "Send the refund reply",
            preview: "Hi — your refund is on the way.",
            target: "customer@example.com",
            risk: "high",
          },
          decisions: ["go", "stop", "wait"],
          note: "Call this before a consequential non-money action. wait returns approval_id. Poll GET /api/v1/approvals/:id until go or stop. No decision in 10 minutes = stop. Do not send, post, or write until go.",
          plan: "/billing/pay?plan=action",
          storage: {
            env: ACTION_GATE_DB_ENV,
            schema: ACTION_GATE_SCHEMA,
          },
          mcp: ACTION_GATE_MCP_NOTE,
        }),
      POST: async ({ request }) => {
        const apiKey = readApiKey(request);
        let body: {
          action_type?: string;
          summary?: string;
          preview?: string;
          target?: string;
          risk?: string;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "JSON body required." }, 400);
        }
        const result = await checkActionIntent({ apiKey, body });
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(result.result, result.status);
      },
    },
  },
});
