import { createFileRoute } from "@tanstack/react-router";
import { handleOauthDiscovery } from "@/lib/oauth/http";

function discovery({ request }: { request: Request }) {
  return handleOauthDiscovery(request) ?? new Response(null, { status: 404 });
}

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      OPTIONS: discovery,
      GET: discovery,
      HEAD: discovery,
    },
  },
});
