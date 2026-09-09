# AgentKit + x402 adapters

Thin helpers that call **POST /api/v1/check** before a send. Copy these files. You keep the keys.

Allow means send. Wait is a hold — you decide in Approval Inbox (hold vs block). Stop means do not send.

## AgentKit

Set a daily cap and an approval threshold in the console, then Connect your agent:

```ts
import { createAgentKitPolicyProvider } from "./agentkit.ts";

const policyProvider = createAgentKitPolicyProvider({
  apiKey: process.env.AGENT_CONTROL_API_KEY,
});
// Pass policyProvider into AgentKit BasePayConfig
```

Docs recipe: https://agent-control.net/docs#policy-recipe

## x402

```ts
import { createX402BeforePaymentHook } from "./x402.ts";

client.onBeforePaymentCreation(
  createX402BeforePaymentHook({ apiKey: process.env.AGENT_CONTROL_API_KEY }),
);
```

If the check says stop, do not send. Docs: https://agent-control.net/docs#adapters

Human path: get an API key → they ask before they pay → 1-day trial → Pay $29 USDC on Solana. https://agent-control.net/connect

## Agent Meter (not these adapters)

Separate from the Human App. These AgentKit and x402 files call **POST /api/v1/check** with an API key. Do not reuse them for Agent Meter.

Agent Meter: Agents pay themselves. A $0.25 pass. Then scan and preflight. No inbox. No email, no API key, no Approval Inbox. Scan and preflight use `X-Agent-Pass`. They do not wait on a human.

Curl recipe: https://agent-control.net/docs#agent-meter
