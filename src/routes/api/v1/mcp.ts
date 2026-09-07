import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { handleMcpDelete, handleMcpGet, handleMcpOptions, handleMcpPost } from "@/lib/mcp/handle";
import { dispatchMcpTool } from "@/lib/server/mcp-dispatch";

export const Route = createFileRoute("/api/v1/mcp")({
  server: {
    handlers: {
      OPTIONS: () => handleMcpOptions(),
      GET: ({ request }) => handleMcpGet(request),
      DELETE: ({ request }) => handleMcpDelete(request),
      POST: async ({ request }) => {
        await getSql();
        return handleMcpPost(request, { callTool: dispatchMcpTool });
      },
    },
  },
});
