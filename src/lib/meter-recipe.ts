/**
 * Agent Meter discovery recipe — agents pay themselves.
 * Separate from the Human App (Inbox, trial, API key, $29).
 * Customer/discovery prose stays plain English. API names stay in the curl sample.
 */

export const METER_EYEBROW = "Agent Meter";
/** Locked Meter headline. The look question lives in LOOK_QUESTION. */
export const METER_HEADLINE = "Agents pay themselves";
export const METER_LEDE = "First 5 free. Then $0.02 USDC.";
export const METER_SEPARATE =
  "Separate from the Human App. Then scan and preflight. No email, no API key, no Approval Inbox.";
export const METER_RISKS = "ok | new | warn | sink";
export const METER_PACKS = "Packs: looks_20 $0.20. addresses_100 $0.15. Ticket: stamp_tx $0.05.";
export const METER_TICKET = "Take this ticket or we do not take your USDC.";
export const METER_DOCS_HREF = "/docs#agent-meter";
export const METER_DOCS_URL = "https://agent-control.net/docs#agent-meter";

/** Copy-paste agent pay — no Phantom. Same file as src/adapters/meter-pay.ts. */
export const METER_PAY_SNIPPET = `import { buyMeterPass } from "./src/adapters/meter-pay.ts";
await buyMeterPass({ keypair });`;

/** Free-look header. Pick any string; first 5 looks on that id are free. */
export const METER_FREE_LOOK_NOTE =
  "pick any string; first 5 looks on that id are free; then 402 look $0.02";

export const METER_FREE_LOOK_CURL =
  "curl -s -X POST https://agent-control.net/api/v1/meter/scan -H 'content-type: application/json' -H 'X-Agent-Pass: <your-id>' -d '{\"chain\":\"solana\",\"address\":\"<destination>\"}'";

/** Exact one-file recipe for llms.txt and /docs. Discovery: llms → pricing → 402 → MCP. */
export const METER_RECIPE = `# 1 discover
# https://agent-control.net/llms.txt
curl -s https://agent-control.net/api/v1/meter/pricing
# 2 look — First 5 free. Then $0.02 USDC. One address. ok | new | warn | sink
# ${METER_FREE_LOOK_NOTE}
${METER_FREE_LOOK_CURL}
# 3 after 5, POST /api/v1/meter/pass → 402 look $0.02 USDC on Solana to pay_to WITH reference
curl -s -X POST https://agent-control.net/api/v1/meter/pass -H 'content-type: application/json' -d '{}'
# copy src/adapters/meter-pay.ts — agent wallet signs and sends (no Phantom)
${METER_PAY_SNIPPET}
# 4 watch
curl -s -X POST https://agent-control.net/api/v1/meter/watch -H 'content-type: application/json' -d '{"invoice_id":"inv_…"}'
# 5 packs looks_20 $0.20 · addresses_100 $0.15 · stamp_tx $0.05 ticket
# Take this ticket or we do not take your USDC.
# 6 MCP meter_* at /api/v1/mcp`;

export const METER_SCAN_CURL =
  'curl -s -X POST https://agent-control.net/api/v1/meter/scan -H \'content-type: application/json\' -H \'X-Agent-Pass: <pass>\' -d \'{"chain":"solana","address":"<destination>"}\'';

export const METER_PREFLIGHT_CURL =
  'curl -s -X POST https://agent-control.net/api/v1/meter/preflight -H \'content-type: application/json\' -H \'X-Agent-Pass: <pass>\' -d \'{"chain":"solana","wallet":"<wallet>","to":"<destination>","value_usd":10,"cap_usd":100}\'';

export const METER_STEPS = [
  {
    n: "1",
    t: "Discover",
    d: "Read /llms.txt then GET pricing. Public. No key.",
    code: "curl -s https://agent-control.net/api/v1/meter/pricing",
  },
  {
    n: "2",
    t: "Look",
    d: "Can I pay this address? First 5 free. Then $0.02 USDC. ok | new | warn | sink. Never hold. Pick any string; first 5 looks on that id are free; then 402 look $0.02.",
    code: METER_FREE_LOOK_CURL,
  },
  {
    n: "3",
    t: "Pay $0.02",
    d: "After 5 free, 402 look. Your agent wallet sends 0.02 USDC on Solana to pay_to with the reference. Copy src/adapters/meter-pay.ts. No Phantom. Default sku is look. Pack looks_20 is $0.20.",
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
    t: "Packs and ticket",
    d: "Packs: looks_20 $0.20. addresses_100 $0.15. Ticket: stamp_tx $0.05. Take this ticket or we do not take your USDC. Then MCP meter_* tools.",
    code: `${METER_SCAN_CURL}\n${METER_PREFLIGHT_CURL}`,
  },
] as const;
