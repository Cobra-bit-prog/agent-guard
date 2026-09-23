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

Agent Meter: Agents pay themselves. Can I pay this address? Buy looks_20 pack ($0.20) or look $0.10. Stamp ticket $0.05. look $0.10 is optional one-shot. ok | new | warn | sink. Packs: looks_20 $0.20. addresses_100 $0.15. Ticket: stamp_tx $0.05. Take this ticket or we do not take your USDC. No inbox. No email, no API key, no Approval Inbox. Scan and preflight use a paid `X-Agent-Pass`. They do not wait on a human. Meter never holds.

Prefer `meter-pay-base.ts` if you have no Solana key. Omit sku to buy looks_20 $0.20 (20 looks). look $0.10 is optional one-shot. Sign Base USDC EIP-3009 exact to base_pay_to (CDP/AgentKit/viem `signExact`). Then watch until the pass token. We never take keys.

```ts
import { buyMeterPassBase } from "./meter-pay-base.ts";

const { token } = await buyMeterPassBase({ from, signExact });
// POST scan / preflight with header X-Agent-Pass: token
```

Optional Solana: copy `meter-pay.ts`. Your agent wallet sends USDC to pay_to with the 402 reference (extra non-signer account on the transfer).

```ts
import { buyMeterPass } from "./meter-pay.ts";

const { token } = await buyMeterPass({ keypair });
```

If you already have the 402 JSON (`base_pay_to`, `amount_base_units`, `invoice_id`, `sign_exact`):

```ts
import { payMeterPassBase, meterExactTypedData } from "./meter-pay-base.ts";

const signExact = async (authorization) => {
  const signature = await wallet.signTypedData(meterExactTypedData(authorization));
  return { authorization, signature };
};
const { payment } = await payMeterPassBase({ invoice, from, signExact });
// meter_watch { invoice_id, payment } until token
```

Omit sku to buy looks_20 pack ($0.20) → X-Agent-Pass. look $0.10 is optional one-shot. Not pass_1h. Docs: https://agent-control.net/docs#agent-meter

Directory payment-ready monitors should **GET /api/v1/meter/pass** (same 402 as empty POST looks_20). Health / uptime probes that must not mint invoices should **GET /api/v1/meter/pricing**. Do not POST /api/v1/meter/pass from smoke checks — that mints unpaid invoices and pollutes pending_stale. If a probe must POST /pass, send `{"source":"smoke"}` or header `X-Meter-Smoke: 1`. Paying agents should send a richer User-Agent than undici's default `node` (that exact string is treated as a directory probe).

## Stamp gate

Copy `stamp-gate.ts`. Take this ticket or we do not take your USDC.

Header `X-Stamp-Id`. The helper GETs `/api/v1/meter/stamp/:id`. Allow only if `verified` is true and `decision` is allow. Otherwise 402 with the buy recipe. No email. No API key. We never take keys.

Live dogfood gate: `GET` or `POST /api/v1/gate/demo` with the same header.

```ts
import { requireMerchantStamp } from "./stamp-gate.ts";

const gate = await requireMerchantStamp(request);
if (!gate.ok) return Response.json(gate.body, { status: gate.status });
```
