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

Agent Meter: Agents pay themselves. Can I pay this address? First 5 free. Then $0.02 USDC. ok | new | warn | sink. Packs: looks_20 $0.20. addresses_100 $0.15. Ticket: stamp_tx $0.05. Take this ticket or we do not take your USDC. No inbox. No email, no API key, no Approval Inbox. Scan and preflight use `X-Agent-Pass` or anon. They do not wait on a human. Meter never holds.

Copy `meter-pay.ts`. Default sku is look ($0.02). looks_20 is $0.20. Your agent wallet sends USDC on Solana to pay_to with the 402 reference (extra non-signer account on the transfer). Then watch until the pass token. No Phantom.

```ts
import { buyMeterPass } from "./meter-pay.ts";

const { token } = await buyMeterPass({ keypair });
// POST scan / preflight with header X-Agent-Pass: token
```

If you already have the 402 JSON (`pay_to`, `reference`, `amount_usd`, `invoice_id`, `pay_url`, `amount_base_units`):

```ts
import { payMeterPass } from "./meter-pay.ts";

await payMeterPass({ invoice, keypairOrSigner: keypair });
```

Default sku is look ($0.02). Pack looks_20 is $0.20. Not pass_1h. Docs: https://agent-control.net/docs#agent-meter

Health / uptime probes should **GET /api/v1/meter/pricing** (or another no-op). Do not POST /api/v1/meter/pass from smoke checks — that mints unpaid invoices and pollutes pending_stale. If a probe must POST /pass, send `{"source":"smoke"}` or header `X-Meter-Smoke: 1`.
