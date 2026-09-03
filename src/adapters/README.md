# AgentKit + x402 adapters

Thin helpers that call **POST /api/v1/check** before a send. Copy these files. You keep the keys.

Allow means send. Wait is a hold — you decide in Approval Inbox (hold vs block). Stop means do not send.

## AgentKit

```ts
import { createAgentKitPolicyProvider } from "./agentkit.ts";

const policyProvider = createAgentKitPolicyProvider({
  apiKey: process.env.AGENT_CONTROL_API_KEY,
});
// Pass policyProvider into AgentKit BasePayConfig
```

## x402

```ts
import { createX402BeforePaymentHook } from "./x402.ts";

client.onBeforePaymentCreation(
  createX402BeforePaymentHook({ apiKey: process.env.AGENT_CONTROL_API_KEY }),
);
```

If the check says stop, do not send. Docs: https://agent-control.net/docs#adapters
