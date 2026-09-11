/**
 * Agent Meter discovery recipe — agents pay themselves.
 * Separate from the Human App (Inbox, trial, API key, $29).
 * Customer/discovery prose stays plain English. API names stay in the curl sample.
 */

export const METER_EYEBROW = "Agent Meter";
export const METER_HEADLINE = "Agents pay themselves";
export const METER_LEDE = "A $0.25 pass. Then scan and preflight. No inbox.";
export const METER_SEPARATE =
  "Separate from the Human App. No email, no API key, no Approval Inbox.";
export const METER_DOCS_HREF = "/docs#agent-meter";
export const METER_DOCS_URL = "https://agent-control.net/docs#agent-meter";

/** Copy-paste agent pay — no Phantom. Same file as src/adapters/meter-pay.ts. */
export const METER_PAY_SNIPPET = `import { buyMeterPass } from "./src/adapters/meter-pay.ts";
await buyMeterPass({ keypair });`;

/** Exact one-file recipe for llms.txt and /docs. Step 3 is the agent wallet. */
export const METER_RECIPE = `# 1 discover
curl -s https://agent-control.net/api/v1/meter/pricing
# 2 invoice
curl -s -X POST https://agent-control.net/api/v1/meter/pass -H 'content-type: application/json' -d '{}'
# 3 pay 0.25 USDC on Solana to pay_to WITH reference from the 402
# copy src/adapters/meter-pay.ts — agent wallet signs and sends (no Phantom)
${METER_PAY_SNIPPET}
# 4 poll
curl -s -X POST https://agent-control.net/api/v1/meter/watch -H 'content-type: application/json' -d '{"invoice_id":"inv_…"}'
# 5 use scan + preflight with X-Agent-Pass`;

export const METER_SCAN_CURL =
  'curl -s -X POST https://agent-control.net/api/v1/meter/scan -H \'content-type: application/json\' -H \'X-Agent-Pass: <pass>\' -d \'{"chain":"solana","address":"<destination>"}\'';

export const METER_PREFLIGHT_CURL =
  'curl -s -X POST https://agent-control.net/api/v1/meter/preflight -H \'content-type: application/json\' -H \'X-Agent-Pass: <pass>\' -d \'{"chain":"solana","wallet":"<wallet>","to":"<destination>","value_usd":10,"cap_usd":100}\'';

export const METER_STEPS = [
  {
    n: "1",
    t: "Discover",
    d: "Read the pass price. Public. No key.",
    code: "curl -s https://agent-control.net/api/v1/meter/pricing",
  },
  {
    n: "2",
    t: "Invoice",
    d: "Ask for a pass. You get a 402 with pay_to and a reference.",
    code: "curl -s -X POST https://agent-control.net/api/v1/meter/pass -H 'content-type: application/json' -d '{}'",
  },
  {
    n: "3",
    t: "Pay $0.25",
    d: "Your agent wallet sends 0.25 USDC on Solana to pay_to with the reference from the 402. Copy src/adapters/meter-pay.ts. No Phantom.",
    code: METER_PAY_SNIPPET,
  },
  {
    n: "4",
    t: "Watch",
    d: "Send the invoice_id until the pass token comes back.",
    code: `curl -s -X POST https://agent-control.net/api/v1/meter/watch -H 'content-type: application/json' -d '{"invoice_id":"inv_…"}'`,
  },
  {
    n: "5",
    t: "Scan and preflight",
    d: "Use X-Agent-Pass. Scan a destination. Preflight is allow or stop against a cap you set.",
    code: `${METER_SCAN_CURL}\n${METER_PREFLIGHT_CURL}`,
  },
] as const;
