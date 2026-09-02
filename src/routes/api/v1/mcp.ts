import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, readApiKey } from "@/lib/server/http";
import { agentStatusForKey, checkTransferIntent, pollApprovalIntent } from "@/lib/server/intent";
import { getSql } from "@/lib/db";

const TOOLS = [
  {
    name: "check_transfer",
    description:
      "MUST be called before the agent signs or broadcasts a transfer. Returns allow, alert, hold, or block. If must_abort is true, do not sign. If decision is hold, poll get_approval until allow or block.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Destination wallet address" },
        value_usd: { type: "number", description: "Transfer size in USD" },
      },
      required: ["to", "value_usd"],
    },
  },
  {
    name: "get_agent_status",
    description: "Returns whether this agent is paused, expired, or healthy.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_approval",
    description:
      "Poll a held pre-sign check. Pass approval_id from check_transfer. Repeat until decision is allow or block.",
    inputSchema: {
      type: "object",
      properties: {
        approval_id: {
          type: "string",
          description: "ID returned when check_transfer decision is hold",
        },
      },
      required: ["approval_id"],
    },
  },
];

export const Route = createFileRoute("/api/v1/mcp")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      GET: () =>
        json({
          name: "Agent Control",
          protocol: "mcp",
          tools: TOOLS,
          auth: "Bearer agent API key",
        }),
      POST: async ({ request }) => {
        await getSql();
        let msg: {
          jsonrpc?: string;
          id?: string | number;
          method?: string;
          params?: {
            name?: string;
            arguments?: {
              to?: string;
              value_usd?: number;
              valueUsd?: number;
              approval_id?: string;
            };
          };
        } = {};
        try {
          msg = (await request.json()) as typeof msg;
        } catch {
          return json({ error: "JSON-RPC body required." }, 400);
        }
        const id = msg.id ?? 1;
        const method = msg.method ?? "";
        if (method === "initialize") {
          return json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              serverInfo: { name: "Agent Control", version: "1.0.0" },
              capabilities: { tools: {} },
            },
          });
        }
        if (method === "tools/list" || method === "list_tools") {
          return json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
        }
        if (method === "tools/call" || method === "call_tool") {
          const apiKey = readApiKey(request);
          const name = msg.params?.name ?? "";
          if (name === "get_agent_status") {
            const status = await agentStatusForKey(apiKey);
            if (!status) {
              return json(
                { jsonrpc: "2.0", id, error: { code: 401, message: "Unknown API key." } },
                401,
              );
            }
            return json({
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: JSON.stringify(status) }] },
            });
          }
          if (name === "check_transfer") {
            const args = msg.params?.arguments ?? {};
            const result = await checkTransferIntent({
              apiKey,
              to: String(args.to ?? ""),
              valueUsd: Number(args.value_usd ?? args.valueUsd ?? 0),
            });
            if (!result.ok) {
              return json(
                { jsonrpc: "2.0", id, error: { code: result.status, message: result.error } },
                result.status,
              );
            }
            return json({
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: JSON.stringify(result.result) }] },
            });
          }
          if (name === "get_approval") {
            const args = msg.params?.arguments ?? {};
            const result = await pollApprovalIntent({
              apiKey,
              approvalId: String(args.approval_id ?? ""),
            });
            if (!result.ok) {
              return json(
                { jsonrpc: "2.0", id, error: { code: result.status, message: result.error } },
                result.status,
              );
            }
            return json({
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: JSON.stringify(result.result) }] },
            });
          }
          return json(
            { jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool." } },
            400,
          );
        }
        return json(
          { jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method." } },
          400,
        );
      },
    },
  },
});
