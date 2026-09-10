import { createFileRoute } from "@tanstack/react-router";
import { issuerFromRequest, OAUTH_CORS, oauthJson, readOauthBody } from "@/lib/oauth/http";
import { exchangeToken } from "@/lib/oauth/protocol";
import { getOauthStore } from "@/lib/oauth/sql-store";

export const Route = createFileRoute("/oauth/token")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: OAUTH_CORS }),
      POST: async ({ request }) => {
        const store = await getOauthStore();
        const body = await readOauthBody(request);
        const result = await exchangeToken(store, body, issuerFromRequest(request));
        return oauthJson(result.body, result.status);
      },
    },
  },
});
