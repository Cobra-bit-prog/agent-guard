const readOnly = { readOnlyHint: true, destructiveHint: false } as const;
const writes = { readOnlyHint: false, destructiveHint: false } as const;

export const MCP_TOOLS = [
  {
    name: "check_transfer",
    title: "Check a transfer",
    description:
      "MUST be called before the agent signs or sends a transfer. Returns allow, alert, hold, or block. If must_abort is true, do not sign. If decision is hold, poll get_approval until allow or block.",
    annotations: writes,
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
    title: "Get agent status",
    description: "Returns whether this agent is paused, expired, or healthy.",
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_approval",
    title: "Get approval decision",
    description:
      "Poll a held pre-sign check. Pass approval_id from check_transfer. Repeat until decision is allow or block.",
    annotations: readOnly,
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
  {
    name: "get_pricing",
    title: "Get pricing",
    description:
      "List Agent Control plans and trial truth. Starter $29 / Pro $49 / Team $149. 1-day trial, no card, no KYC. Pay on-chain USDC on Solana. A human principal owns billing and Approval Inbox.",
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "start_trial",
    title: "Start a trial",
    description:
      "Invite a human to start the 1-day trial. Provide human_email or an existing principal_id. Agents cannot open a root account. The human owns billing and Approval Inbox.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        human_email: { type: "string", description: "Email of the human customer of record" },
        principal_id: { type: "string", description: "Existing human user id, if you already have one" },
      },
    },
  },
  {
    name: "attach_human",
    title: "Attach a human",
    description:
      "Attach this agent to a human principal (email or existing principal_id). Does not move the agent to a different human. Agents cannot decide Approval Inbox.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        human_email: { type: "string", description: "Email of the human customer of record" },
        principal_id: { type: "string", description: "Existing human user id" },
      },
    },
  },
  {
    name: "create_checkout",
    title: "Create checkout",
    description:
      "Open a pay request on the human principal that owns this agent. Wraps POST /api/v1/billing/checkout. The human pays on-chain USDC (Solana). Not automatic payment. Agents cannot decide Approval Inbox.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        plan: { type: "string", description: "starter, pro, or team" },
        asset: { type: "string", description: "usdc (default), sol, or eth" },
        chain: { type: "string", description: "solana (default), ethereum, or base" },
      },
      required: ["plan"],
    },
  },
  {
    name: "get_status",
    title: "Get subscription status",
    description:
      "Subscription or trial status for the human principal that owns this agent. Does not return Approval Inbox items and cannot approve holds.",
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meter_pricing",
    title: "Agent Meter pricing",
    description:
      "Public. Agent Meter pass price and endpoints. No email. No API key. Separate from the Human App $29 plans.",
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meter_buy_pass",
    title: "Buy an Agent Meter pass",
    description:
      "Public. Returns HTTP 402 invoice to pay 0.25 USDC on Solana, or issues a pass when proof is accepted. No human account.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        sku: { type: "string", description: "pass_1h" },
        proof: { type: "object", description: "Payment proof. { type: dev } only when METER_DEV_GRANT=1" },
        pass_token: { type: "string" },
      },
    },
  },
  {
    name: "meter_scan",
    title: "Scan a destination",
    description:
      "Public with X-Agent-Pass. Risk score for an address (ok/new/warn/sink). Does not block a send. Does not use Approval Inbox.",
    annotations: readOnly,
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", description: "solana, ethereum, or base" },
        address: { type: "string" },
        pass_token: { type: "string" },
      },
      required: ["chain", "address"],
    },
  },
  {
    name: "meter_preflight",
    title: "Preflight against a self cap",
    description:
      "Public with X-Agent-Pass. allow or stop vs cap_usd the agent declared. Never hold. No Inbox.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string" },
        wallet: { type: "string" },
        to: { type: "string" },
        value_usd: { type: "number" },
        cap_usd: { type: "number" },
        pass_token: { type: "string" },
      },
      required: ["chain", "wallet", "to", "value_usd", "cap_usd"],
    },
  },
] as const;

export const MCP_STOREFRONT_TOOLS = [
  "get_pricing",
  "start_trial",
  "attach_human",
  "create_checkout",
  "get_status",
] as const;

export function mcpDiscovery() {
  return {
    name: "Agent Control",
    protocol: "mcp",
    tools: MCP_TOOLS,
    auth: "Bearer agent API key (required for check, approval, checkout, and status; get_pricing and meter_* are public; meter scan/preflight need X-Agent-Pass)",
    storefront: MCP_STOREFRONT_TOOLS,
    meter: ["meter_pricing", "meter_buy_pass", "meter_scan", "meter_preflight"],
  };
}
