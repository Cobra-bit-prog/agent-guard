import { createFileRoute } from "@tanstack/react-router";
import { issuerFromRequest, OAUTH_CORS, oauthJson, readOauthBody } from "@/lib/oauth/http";
import { registerClient } from "@/lib/oauth/protocol";
import { getOauthStore } from "@/lib/oauth/sql-store";

export const Route = createFileRoute("/oauth/register")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: OAUTH_CORS }),
      POST: async ({ request }) => {
        const store = await getOauthStore();
        const body = await readOauthBody(request);
        const result = await registerClient(store, body);
        return oauthJson(result.body, result.status);
      },
      GET: ({ request }) =>
        oauthJson({
          registration_endpoint: `${issuerFromRequest(request)}/oauth/register`,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
        }),
    },
  },
});
