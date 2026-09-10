import { MCP_HUMAN_SCOPE } from "./copy.ts";
import { mcpResourceUrl } from "./protocol.ts";

export function authorizationServerMetadata(issuer: string) {
  const base = issuer.replace(/\/$/, "");
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: [MCP_HUMAN_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
  };
}

export function protectedResourceMetadata(issuer: string) {
  const base = issuer.replace(/\/$/, "");
  return {
    resource: mcpResourceUrl(base),
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_HUMAN_SCOPE],
  };
}

export function oauthWwwAuthenticate(issuer: string): string {
  const base = issuer.replace(/\/$/, "");
  return `Bearer realm="Agent Control", resource_metadata="${base}/.well-known/oauth-protected-resource/api/v1/mcp"`;
}
