# Connect your agent

Can I pay this address? First 5 free. Then $0.02. No inbox. Agent Meter is public — no API key. Discovery: `GET /.well-known/x402`.

Human App (separate): External audit for your agents. Point Cursor or Grok at the live MCP so the agent asks before a send. You keep the keys.

**URL:** `https://agent-control.net/api/v1/mcp`  
**Auth (Human App):** `Authorization: Bearer ${AGENT_CONTROL_API_KEY}`  
**Env var:** `AGENT_CONTROL_API_KEY` — agent API key from the Agent Control console. Meter tools do not need it.

`get_pricing` is public. Spend checks, checkout, and status need the key. This is Streamable HTTP. Official registry publish (`net.agent-control/agent-control`) is a separate track.

If the agent skips the check, Inbox cannot stop that send. Hold vs block waits in Approval Inbox.

## Cursor marketplace

Plugin id: `agent-control`. Submit / review is in progress — not listed yet.

When listed, all Cursor users can install from **Customize → Plugins → Agent Control** (not a personal MCP add). Then **Plugins → Configure** and set `AGENT_CONTROL_API_KEY` from the Agent Control console. You keep the keys.

Until then, use Customize / MCPs or the local plugin path below.

## Cursor Customize / MCPs

Fallback if the marketplace listing is not available yet:

1. Open **Customize**, then **MCPs**.
2. Add a remote server.
3. Paste `https://agent-control.net/api/v1/mcp`.
4. Add header `Authorization` with value `Bearer` plus your agent API key. You can store the key as env `AGENT_CONTROL_API_KEY` and use `Bearer ${env:AGENT_CONTROL_API_KEY}` in a project `.cursor/mcp.json`.

Local-plugin fallback: copy this repo under `~/.cursor/plugins/local/agent-control` (keep `.cursor-plugin/plugin.json` and `mcp.json`). In **Plugins → Configure**, set `AGENT_CONTROL_API_KEY`. The plugin uses `Bearer ${AGENT_CONTROL_API_KEY}` — a plugin variable, not a committed secret.

## Grok Bot Plugins

Once listed, open **Settings → Plugins** and add Agent Control.

Until then, custom add:

1. Open **Settings → Plugins**.
2. Add a custom remote server.
3. Same URL as above.
4. Same header: `Authorization: Bearer` plus your agent API key.

Grok Bot only talks to a public HTTPS MCP. This one already is.

## Grok.com → connectors → Custom

1. Go to [grok.com/connectors](https://grok.com/connectors).
2. **New Connector**, then **Custom**.
3. Paste `https://agent-control.net/api/v1/mcp`.
4. When asked for auth, use `Authorization: Bearer` plus the agent API key.

On a team plan, an admin may need to add the connector first. After connect, ask Grok to read pricing (`get_pricing`) or check a send (`check_transfer`). Hold vs block is still decided by you in Approval Inbox.

## Claude Connectors (OAuth)

Claude Connectors use OAuth 2.1 (authorization code + PKCE) on the same Streamable HTTP MCP. You stay the customer of record. You keep the keys. Cursor and Grok Bearer API keys still work.

1. In Claude, add a custom connector to `https://agent-control.net/api/v1/mcp`.
2. Sign in and allow Claude. Pick which agent it may check.
3. Claude can then ask before a send, wait for your Approval Inbox decision, and open pricing or checkout for you.

Privacy: https://agent-control.net/privacy

## After you connect

Create an account, enroll the wallet, set policy, then issue the API key. Connect your agent so every send asks first. You keep the keys.

Short site version: https://agent-control.net/docs#connectors

Connect your agent (trial → Pay $29): https://agent-control.net/connect

