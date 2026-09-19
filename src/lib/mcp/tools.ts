import { METER_AGENT_LEAD, STAMP_MERCHANT_COPY, STAMP_TICKET_COPY } from "../meter/pricing.ts";

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;
const writes = { readOnlyHint: false, destructiveHint: false } as const;

export const MCP_TOOLS = [
  {
    name: "meter_pricing",
    title: "Agent Meter pricing",
    description:
      `${METER_AGENT_LEAD} Public catalog from this tool: look, looks_20, addresses_100, stamp_tx. default_sku is look. paid_sku looks_20. Base USDC (EIP-3009 exact) and Solana USDC. No email. No API key. Human App $29 plans are separate.`,
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meter_buy_pass",
    title: "Buy an Agent Meter pass",
    description:
      `${METER_AGENT_LEAD} After free-5, call with sku looks_20 (or omit) to buy a pack that mints/extends X-Agent-Pass. look $0.10 is optional one-shot. Returns a payable invoice as tool content (ok:true / status payment_required) with pay_to, base_pay_to, accepts (Base USDC EIP-3009 exact and Solana USDC), amount_usd, amount_base_units, reference, pay_url, invoice_id, watch_url, adapter_url, base_adapter_url, preferred_rail, pay_page, next_tool, tool_fields, sign_exact, adapter_snippet, next_steps. Prefer Base EIP-3009 exact to base_pay_to (CDP/AgentKit; no Solana key) then meter_watch with payment. Use sign_exact + adapter_snippet to finish in-process (payMeterPassBase / signTypedData). Fetch base_adapter_url only if you need the full file. Optional Solana: fetch adapter_url. 402 invoice includes pay_page for Phantom laptop as a last resort. We never take keys. Packs: looks_20 / addresses_100 / stamp_tx. No human account.`,
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        sku: {
          type: "string",
          description: "Catalog id from meter_pricing. Omit or looks_20 is the pack after free-5. look $0.10 is optional one-shot. Packs: looks_20, addresses_100, stamp_tx. pass_1h stays in catalog only.",
        },
        proof: { type: "object", description: "Payment proof. { type: dev } only when METER_DEV_GRANT=1. Never send a secret key." },
        pass_token: { type: "string", description: "Existing X-Agent-Pass to extend with a pack." },
        signature: {
          type: "string",
          description: "Optional on-chain tx signature after you sign locally. Not a private key.",
        },
        payment: {
          type: "object",
          description: "Optional Base EIP-3009 exact payload. Same JSON as PAYMENT-SIGNATURE. Never send a secret key.",
        },
      },
    },
  },
  {
    name: "meter_watch",
    title: "Watch a Meter invoice",
    description:
      `${METER_AGENT_LEAD} After Base EIP-3009 exact (CDP/AgentKit; no Solana key) or optional Solana USDC, call with invoice_id until token. Pass payment for Base (same JSON as PAYMENT-SIGNATURE). Repeat until the result includes token — that is X-Agent-Pass. Then meter_scan with pass_token. Optional signature (tx sig only). We never take keys. No human account.`,
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "From meter_buy_pass / 402 invoice." },
        sku: { type: "string" },
        signature: {
          type: "string",
          description: "Optional Solana tx signature after local sign. Not a private key.",
        },
        payment: {
          type: "object",
          description: "Optional Base EIP-3009 exact payload. Never send a secret key.",
        },
      },
    },
  },
  {
    name: "meter_scan",
    title: "Scan a destination",
    description:
      `${METER_AGENT_LEAD} One look = one address. Send X-Agent-Pass with any string; first 5 looks on that id are free; then 402 looks_20 pack $0.20 (look $0.10 is optional one-shot). Prefer Base USDC (EIP-3009 exact) to base_pay_to (CDP/AgentKit; no Solana key). Optional Solana USDC. 402 invoice includes next_steps and pay_page for Phantom laptop as a last resort. Risk ok|new|warn|sink. Never hold.`,
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
      `${METER_AGENT_LEAD} One look = one address. Send X-Agent-Pass with any string; first 5 looks on that id are free; then 402 looks_20 pack $0.20. look $0.10 is optional one-shot. Body: chain, wallet, to, value_usd, cap_usd. allow or stop vs cap_usd. Never hold.`,
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
  {
    name: "meter_scan_batch",
    title: "Scan a batch of destinations",
    description:
      `${METER_AGENT_LEAD} Risk scores for up to 100 addresses. Sku addresses_100 ($0.15) covers scan_batch. Never hold. ok|new|warn|sink.`,
    annotations: readOnly,
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", description: "solana, ethereum, or base" },
        addresses: { type: "array", items: { type: "string" }, description: "Up to 100 addresses" },
        pass_token: { type: "string" },
        sku: { type: "string" },
      },
      required: ["chain", "addresses"],
    },
  },
  {
    name: "meter_stamp",
    title: "Stamp an allow or stop receipt",
    description:
      `${METER_AGENT_LEAD} stamp_tx $0.05. ${STAMP_MERCHANT_COPY} ${STAMP_TICKET_COPY} Signed allow|stop receipt. HMAC-SHA256. Merchants verify with meter_verify_stamp before accepting agent USDC.`,
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        decision: { type: "string", description: "allow or stop. Optional if value_usd and cap_usd are set." },
        chain: { type: "string" },
        wallet: { type: "string" },
        to: { type: "string" },
        value_usd: { type: "number" },
        cap_usd: { type: "number" },
        pass_token: { type: "string" },
      },
    },
  },
  {
    name: "meter_verify_stamp",
    title: "Verify a Meter stamp",
    description: `${METER_AGENT_LEAD} Public. ${STAMP_MERCHANT_COPY} ${STAMP_TICKET_COPY} GET a signed allow|stop receipt by stamp_id before you accept agent USDC. If verified is true and decision is allow, take the USDC. If not, do not take it. No email. No API key.`,
    annotations: readOnly,
    inputSchema: {
      type: "object",
      properties: {
        stamp_id: { type: "string" },
        id: { type: "string" },
      },
    },
  },
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
    description: `${METER_AGENT_LEAD} Agent Meter is public. Human App is separate.`,
    protocol: "mcp",
    tools: MCP_TOOLS,
    auth: "Agent Meter is public (X-Agent-Pass after 5 free looks). Human App: Bearer agent API key or Claude Connector OAuth (required for check, approval, checkout, and status; get_pricing is public)",
    storefront: MCP_STOREFRONT_TOOLS,
    meter: [
      "meter_pricing",
      "meter_buy_pass",
      "meter_watch",
      "meter_scan",
      "meter_preflight",
      "meter_scan_batch",
      "meter_stamp",
      "meter_verify_stamp",
    ],
  };
}
