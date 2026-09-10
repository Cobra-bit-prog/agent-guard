import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { handleMcpDelete, handleMcpGet, handleMcpOptions, handleMcpPost } from "@/lib/mcp/handle";
import { issuerFromRequest } from "@/lib/oauth/http";
import { oauthWwwAuthenticate } from "@/lib/oauth/metadata";
import { resolveMcpCredential } from "@/lib/oauth/resolve";
import { getOauthStore } from "@/lib/oauth/sql-store";
import { dispatchMcpTool } from "@/lib/server/mcp-dispatch";

export const Route = createFileRoute("/api/v1/mcp")({
  server: {
    handlers: {
      OPTIONS: () => handleMcpOptions(),
      GET: ({ request }) => handleMcpGet(request),
      DELETE: ({ request }) => handleMcpDelete(request),
      POST: async ({ request }) => {
        await getSql();
        const store = await getOauthStore();
        return handleMcpPost(request, {
          resolveApiKey: async (req) => (await resolveMcpCredential(req, store)).apiKey,
          wwwAuthenticate: oauthWwwAuthenticate(issuerFromRequest(request)),
          callTool: (name, args, apiKey) => dispatchMcpTool(name, args, apiKey, request),
        });
      },
    },
  },
});
