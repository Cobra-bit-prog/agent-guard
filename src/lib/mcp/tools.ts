import { METER_AGENT_LEAD, STAMP_TICKET_COPY } from "../meter/pricing.ts";

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;
const writes = { readOnlyHint: false, destructiveHint: false } as const;

export const MCP_TOOLS = [
  {
    name: "meter_pricing",
    title: "Agent Meter pricing",
    description:
      `${METER_AGENT_LEAD} No Authorization / Bearer empty. Public catalog from this tool: look, looks_20, addresses_100, stamp_tx. default_sku is look. paid_sku looks_20. Base USDC (EIP-3009 exact) and Solana USDC. No email. No API key. Human App $29 plans are separate.`,
    annotations: readOnly,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meter_buy_pass",
    title: "Buy an Agent Meter pass",
    description:
      `${METER_AGENT_LEAD} Call with sku looks_20 (or omit) to buy a pack that mints/extends X-Agent-Pass. look $0.10 is optional one-shot. Returns a payable invoice as tool content (ok:true / status payment_required) with pay_to, base_pay_to, accepts (Base USDC EIP-3009 exact and Solana USDC), amount_usd, amount_base_units, reference, pay_url, invoice_id, watch_url, adapter_url, base_adapter_url, preferred_rail, pay_page, next_tool, tool_fields, sign_exact, adapter_snippet, next_steps. Prefer Base EIP-3009 exact to base_pay_to (CDP/AgentKit; no Solana key) then meter_watch with payment. Use sign_exact + adapter_snippet to finish in-process (payMeterPassBase / signTypedData). Fetch base_adapter_url only if you need the full file. Optional Solana: fetch adapter_url. 402 invoice includes pay_page for Phantom laptop as a last resort. We never take keys. Packs: looks_20 / addresses_100 / stamp_tx. No human account.`,
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        sku: {
          type: "string",
          description: "Catalog id from meter_pricing. Omit or looks_20 is the paid pack. look $0.10 is optional one-shot. Packs: looks_20, addresses_100, stamp_tx. pass_1h stays in catalog only.",
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
      `${METER_AGENT_LEAD} After Base EIP-3009 exact (CDP/AgentKit; no Solana key) or optional Solana USDC, call with invoice_id until token. Pass the Base payment object from payMeterPassBase / sign_exact.payment_template after you fill signature ({ x402Version, payload:{ authorization, signature }, accepted }) — not a raw signature string. Repeat until the result includes token — that is X-Agent-Pass. Then meter_scan with pass_token. Optional signature (tx sig only). We never take keys. No human account.`,
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
          description: "Base x402 v2 payment object from payMeterPassBase / sign_exact.payment_template (x402Version + payload.authorization + payload.signature + accepted). Not a raw signature string. Never send a secret key.",
        },
      },
    },
  },
  {
    name: "meter_scan",
    title: "Scan a destination",
    description:
      `${METER_AGENT_LEAD} One look = one address. No free looks. Without a paid X-Agent-Pass, 402 looks_20 pack $0.20 (look $0.10 is optional one-shot). Prefer Base USDC (EIP-3009 exact) to base_pay_to (CDP/AgentKit; no Solana key). Optional Solana USDC. 402 invoice includes next_steps and pay_page for Phantom laptop as a last resort. Risk ok|new|warn|sink. Never hold.`,
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
      `${METER_AGENT_LEAD} One look = one address. No free looks. Without a paid X-Agent-Pass, 402 looks_20 pack $0.20. look $0.10 is optional one-shot. Body: chain, wallet, to, value_usd, cap_usd. allow or stop vs cap_usd. Never hold.`,
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
      `${METER_AGENT_LEAD} stamp_tx $0.05. ${STAMP_TICKET_COPY} Signed allow|stop receipt. HMAC-SHA256. Merchants verify with meter_verify_stamp before accepting agent USDC.`,
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
    description: `${METER_AGENT_LEAD} Public. ${STAMP_TICKET_COPY} GET a signed allow|stop receipt by stamp_id before you accept agent USDC. If verified is true and decision is allow, take the USDC. If not, do not take it. No email. No API key.`,
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
    name: "check_action",
    title: "Ask before a non-money action",
    description:
      "Action Gate Ask. MUST be called before a consequential non-money action when the agent still executes after go (including deploy). Returns go, stop, or wait. If decision is wait, poll get_approval until go or stop. No decision in 10 minutes = stop. If must_abort is true, do not act. This tool does not send the email, post, or CRM write. To enforce those, call email.send, slack.post, or crm.write. Alias: ask_human.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        action_type: {
          type: "string",
          description: "email.send, slack.post, crm.write, deploy, or another action id",
        },
        summary: { type: "string", description: "One line a human can decide from" },
        preview: { type: "string", description: "Bounded text of what the agent will do after go" },
        target: { type: "string", description: "Optional email, channel, or record id" },
        risk: { type: "string", description: "Optional tag such as low, medium, or high" },
      },
      required: ["action_type", "summary", "preview"],
    },
  },
  {
    name: "ask_human",
    title: "Ask a human before acting",
    description:
      "Same as check_action (Ask). Stop and ask before a consequential non-money action. Returns go, stop, or wait plus approval_id. Poll get_approval. Timeout is stop. Does not forward email, Slack, or CRM. Use email.send, slack.post, or crm.write to enforce.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        action_type: { type: "string" },
        summary: { type: "string" },
        preview: { type: "string" },
        target: { type: "string" },
        risk: { type: "string" },
      },
      required: ["action_type", "summary", "preview"],
    },
  },
  {
    name: "email.send",
    title: "Send email after a human allows it",
    description:
      "Write Gate. Validates the message, runs Action Gate check_action for email.send, and sends only when the decision is go. Unpaid, missing DATABASE_URL, stop, and timeout do not send. If decision is wait, poll get_approval, then call email.send again with approval_id. Uses the human's connected Agentmail inbox. If email is not connected, returns stop and does not send. Same $49 Action Gate seat (plan=action).",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "One recipient email address" },
        subject: { type: "string", description: "Subject the human approves" },
        text: { type: "string", description: "Plain-text body the human approves" },
        approval_id: {
          type: "string",
          description: "From a previous wait. Call again after get_approval returns go.",
        },
        risk: { type: "string", description: "Optional tag such as low, medium, or high" },
      },
    },
  },
  {
    name: "slack.post",
    title: "Post to Slack after a human allows it",
    description:
      "Write Gate. Validates the message, runs Action Gate check_action for slack.post, and posts only when the decision is go. Unpaid, missing DATABASE_URL, stop, and timeout do not post. If decision is wait, poll get_approval, then call slack.post again with approval_id. Uses the Slack incoming webhook saved in Settings. If that webhook is missing, returns stop and does not post. Same $49 Action Gate seat (plan=action).",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message the human approves" },
        channel: { type: "string", description: "Optional channel label, such as #support" },
        summary: { type: "string", description: "Optional one-line summary. Defaults to the message." },
        approval_id: {
          type: "string",
          description: "From a previous wait. Call again after get_approval returns go.",
        },
        risk: { type: "string", description: "Optional tag such as low, medium, or high" },
      },
    },
  },
  {
    name: "crm.write",
    title: "Write to CRM after a human allows it",
    description:
      "Write Gate. Validates the preview, runs Action Gate check_action for crm.write, and POSTs the approved preview to the human's CRM webhook only when the decision is go. Unpaid, missing DATABASE_URL, stop, and timeout do not post. If decision is wait, poll get_approval, then call crm.write again with approval_id. If the CRM webhook is missing, returns stop and does not post. Same $49 Action Gate seat (plan=action).",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One line a human can decide from" },
        preview: { type: "string", description: "Approved text posted to the CRM webhook" },
        payload: { type: "object", description: "Optional JSON object included in the approved preview" },
        target: { type: "string", description: "Optional record id" },
        approval_id: {
          type: "string",
          description: "From a previous wait. Call again after get_approval returns go.",
        },
        risk: { type: "string", description: "Optional tag such as low, medium, or high" },
      },
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
      "Poll a held check. Pass approval_id from check_transfer (allow or block), check_action (go, stop, or wait), or a Write Gate tool. Repeat until the decision is final. Action Gate timeout is stop. Write Gate forwards only when you call email.send, slack.post, or crm.write again with that approval_id after the decision is go.",
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
      "List Agent Control plans and trial truth. Action Gate is $49/mo Solana USDC (plan=action): a person taps go, stop, or wait before Slack or a CRM write. Wallet console: Starter $29 / Pro $49 / Team $149, with a 1-day trial, no card, no KYC. Pay on-chain USDC on Solana. A human principal owns billing and Approval Inbox.",
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
      "Open a pay request on the human principal that owns this agent. Wraps POST /api/v1/billing/checkout. plan action opens Action Gate at $49 Solana USDC. starter, pro, and team open the wallet console. The human pays on-chain. Not automatic payment. Agents cannot decide Approval Inbox.",
    annotations: writes,
    inputSchema: {
      type: "object",
      properties: {
        plan: { type: "string", description: "action ($49 Action Gate, Solana USDC), starter, pro, or team" },
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
    auth: "Meter meter_* tools: no Authorization / Bearer empty. Human App: Bearer agent API key or Claude Connector OAuth (required for check, approval, checkout, and status; get_pricing is public)",
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
