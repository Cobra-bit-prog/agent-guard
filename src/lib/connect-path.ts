/**
 * Human path: Connect AgentKit / x402 → 1-day trial → Pay $29.
 * Same POST /api/v1/check the adapters and MCP check_transfer already call.
 */

import { AGENTKIT_RECIPE_CODE } from "./agentkit-recipe.ts";

export const CONNECT_PATH = "/connect";
export const CONNECT_TRIAL_HREF = "/signup";
export const CONNECT_PAY_HREF = "/billing/pay?plan=starter";
export const CONNECT_TRIAL_CTA = "Start free trial";
export const CONNECT_PAY_CTA = "Pay $29";
export const CONNECT_CHECK_PATH = "/api/v1/check";
export const CONNECT_MCP_TOOL = "check_transfer";

export const CONNECT_HEADLINE = "Connect AgentKit / x402";
export const CONNECT_LEDE =
  "They ask before they pay. You keep the keys. External audit for your agents.";
export const CONNECT_STARTER_LINE =
  "Starter $29 — Connect your agent. You keep the keys. External audit for your agents.";

export const CONNECT_STEPS = [
  {
    n: "1",
    t: "Get an API key",
    d: "Start a 1-day trial (no card, no KYC). Enroll the agent wallet, set a daily cap, then issue an API key. You keep the keys.",
  },
  {
    n: "2",
    t: "Call check before they pay",
    d: "Before the agent pays, POST /api/v1/check — or MCP check_transfer, or the AgentKit / x402 adapter. Same check. If it says stop, do not send.",
  },
  {
    n: "3",
    t: "Start the 1-day trial",
    d: "Full console for 24 hours. They ask before they pay. Off-policy sends wait in Approval Inbox. You keep the keys.",
  },
  {
    n: "4",
    t: "When the trial ends, Pay $29",
    d: "Unlock Starter with $29 USDC on Solana. Scan or tap Pay. No card. No KYC.",
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
