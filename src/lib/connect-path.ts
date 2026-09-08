/**
 * Human path: Connect your agent → 1-day trial → Pay $29.
 * Builders still call the same POST /api/v1/check (adapters + MCP check_transfer).
 * Customer prose stays plain English — keep API names in code samples and docs.
 */

import { AGENTKIT_RECIPE_CODE } from "./agentkit-recipe.ts";

export const CONNECT_PATH = "/connect";
export const CONNECT_TRIAL_HREF = "/signup";
export const CONNECT_PAY_HREF = "/billing/pay?plan=starter";
export const CONNECT_TRIAL_CTA = "Start free trial";
export const CONNECT_PAY_CTA = "Pay $29";
export const CONNECT_CHECK_PATH = "/api/v1/check";
export const CONNECT_MCP_TOOL = "check_transfer";
export const CONNECT_FAQ_DOCS_HREF = "/docs#connect-your-agent";

export const CONNECT_EYEBROW = "Popular agent payment tools";
export const CONNECT_HEADLINE = "Connect your agent";
export const CONNECT_LEDE = "They ask before they pay. You keep the keys.";
export const CONNECT_STARTER_LINE =
  "Starter $29 — 1-day trial, then Pay $29. External audit for your agents.";

export const CONNECT_HOW_HEADING = "How it works";
export const CONNECT_HOW_LEDE =
  "Start a 1-day trial. Plug in your agent. They ask before they pay. You keep the keys.";

export const CONNECT_BUILDERS_HEADING = "Same check wherever they pay from";
export const CONNECT_BUILDERS_LEDE =
  "Before your agent sends money, it asks Agent Control first. Works with AgentKit, x402, or MCP — popular agent payment tools. If we say stop, it does not send.";

export const CONNECT_PAGE_LINK_LABEL = "See the connect steps →";

export const CONNECT_FAQ_ANSWER =
  "Give your agent an API key. Before it sends money, it asks Agent Control. If we say stop, it does not send. Over-limit and new addresses wait for you in Approval Inbox.";

export const CONNECT_STEPS = [
  {
    n: "1",
    t: "Get an API key",
    d: "Start the free trial. Add the wallet. Set a daily spend limit. Copy your key.",
  },
  {
    n: "2",
    t: "Plug it in",
    d: "Before your agent sends money, it asks Agent Control first. Works with AgentKit, x402, or MCP — popular agent payment tools. If we say stop, it does not send.",
  },
  {
    n: "3",
    t: "Try it free",
    d: "Full dashboard for 1 day. Over-limit and new addresses wait for you.",
  },
  {
    n: "4",
    t: "Then Pay $29",
    d: "Unlock with $29 USDC on Solana. No card. No KYC.",
  },
] as const;

export const CONNECT_AGENTKIT_CODE = AGENTKIT_RECIPE_CODE;

export const CONNECT_X402_CODE = `import { createX402BeforePaymentHook } from "./src/adapters/x402.ts";

client.onBeforePaymentCreation(
  createX402BeforePaymentHook({ apiKey: process.env.AGENT_CONTROL_API_KEY }),
);
`;

export const CONNECT_CHECK_CODE = `fetch("https://agent-control.net/api/v1/check", {
  method: "POST",
  headers: {
    Authorization: "Bearer YOUR_AGENT_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ to: destination, value_usd: amount }),
})`;
