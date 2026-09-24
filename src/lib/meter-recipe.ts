/**
 * Agent Meter discovery recipe — agents pay themselves.
 * Separate from the Human App (Inbox, trial, API key, $29).
 * Customer/discovery prose stays plain English. API names stay in the curl sample.
 */

import { METER_PACKS_FIRST, STAMP_MERCHANT_COPY } from "./meter/pricing.ts";

export { METER_PACKS_FIRST, STAMP_MERCHANT_COPY };

export const METER_EYEBROW = "Agent Meter";
/** Locked Meter headline. The look question lives in LOOK_QUESTION. */
export const METER_HEADLINE = "Agents pay themselves";
export const METER_LEDE = METER_PACKS_FIRST;
export const METER_QUESTION = "Can I pay this address?";
export const METER_SEPARATE =
  "Separate from the Human App. Then scan and preflight. No inbox. No email, no API key, no Approval Inbox.";
export const METER_RISKS = "ok | new | warn | sink";
export const METER_PACKS = "Packs: looks_20 $0.20. addresses_100 $0.15. Ticket: stamp_tx $0.05.";
export const METER_TICKET = "Take this ticket or we do not take your USDC.";
export const METER_MERCHANT_STAMP = STAMP_MERCHANT_COPY;
export const METER_DOCS_HREF = "/docs#agent-meter";
export const METER_DOCS_URL = "https://agent-control.net/docs#agent-meter";
export const METER_LLMS_HREF = "/llms.txt";
export const METER_LLMS_URL = "https://agent-control.net/llms.txt";
export const STAMP_PATH = "/stamp";
export const STAMP_URL = "https://agent-control.net/stamp";
export const STAMP_DOCS_HREF = "/docs#stamp";
export const STAMP_DOCS_URL = "https://agent-control.net/docs#stamp";
export const STAMP_SELLER_EYEBROW = "Stamp seller";
export const STAMP_SELLER_HEADLINE = METER_TICKET;
export const STAMP_SELLER_LEDE = METER_MERCHANT_STAMP;
export const STAMP_SELLER_BODY =
  "You sell something. An agent wants to pay you in USDC. Ask for a stamp first. If the stamp is missing or says stop, do not take the USDC.";
export const STAMP_SELLER_VERIFY =
  "GET /api/v1/meter/stamp/:id or MCP meter_verify_stamp. If verified is true and decision is allow, take the USDC. If not, do not take it.";
export const STAMP_VERIFY_CURL =
  "curl -s https://agent-control.net/api/v1/meter/stamp/<stamp_id>";
/** Live dogfood gate. Header X-Stamp-Id. No allow stamp → 402 stamp_tx $0.05. */
export const STAMP_ID_HEADER = "X-Stamp-Id";
export const GATE_DEMO_PATH = "/api/v1/gate/demo";
export const GATE_DEMO_URL = "https://agent-control.net/api/v1/gate/demo";
export const GATE_DEMO_BLOCKED_CURL = "curl -s -D - https://agent-control.net/api/v1/gate/demo";
export const GATE_DEMO_ALLOW_CURL =
  "curl -s -D - https://agent-control.net/api/v1/gate/demo -H 'X-Stamp-Id: <stamp_id>'";
/** Static sibling of /llms.txt. Agents curl this; the /stamp page stays HTML. */
export const STAMP_TXT_PATH = "/stamp.txt";
export const STAMP_TXT_URL = "https://agent-control.net/stamp.txt";
export const STAMP_TXT_CURL = "curl -s https://agent-control.net/stamp.txt";
export const STAMP_BUY_CURL =
  "curl -s -X POST https://agent-control.net/api/v1/meter/pass -H 'content-type: application/json' -d '{\"sku\":\"stamp_tx\"}'";
export const STAMP_BUY_SNIPPET = `import { buyMeterPassBase } from "./src/adapters/meter-pay-base.ts";
await buyMeterPassBase({ from, signExact, sku: "stamp_tx" });`;
export const STAMP_MINT_CURL =
  "curl -s -X POST https://agent-control.net/api/v1/meter/stamp -H 'content-type: application/json' -H 'X-Agent-Pass: <token>' -d '{\"decision\":\"allow\",\"chain\":\"solana\",\"to\":\"<merchant>\"}'";
export const STAMP_SELLER_STEPS = [
  {
    n: "1",
    t: "Ask for the ticket",
    d: `Tell the agent: buy stamp_tx $0.05, then call meter_stamp. ${METER_QUESTION} ${METER_PACKS_FIRST}`,
  },
  {
    n: "2",
    t: "Take the stamp_id",
    d: "They send you a stamp_id. Public verify. No email. No API key.",
  },
  {
    n: "3",
    t: "Verify, then take USDC",
    d: STAMP_SELLER_VERIFY,
  },
  {
    n: "4",
    t: "Or hit the live gate",
    d: `GET ${GATE_DEMO_URL}. Header ${STAMP_ID_HEADER}. No allow stamp → 402 stamp_tx $0.05. Allow → 200.`,
  },
] as const;
export const METER_PRICING_PATH = "/api/v1/meter/pricing";
export const METER_PRICING_URL = "https://agent-control.net/api/v1/meter/pricing";
export const METER_PRICING_CURL = "curl -s https://agent-control.net/api/v1/meter/pricing";
export const METER_DISCOVERY =
  "llms.txt → GET /api/v1/meter/pricing → 402 → MCP meter_* tools.";
export const METER_CONNECT_BODY =
  `${METER_PACKS_FIRST} Agents pay themselves. No inbox. No email. No API key.`;
export const METER_MCP_TOOLS = "meter_pricing, meter_scan, meter_buy_pass, meter_watch";

/** Copy-paste Base buyer — no Solana key. Same file as src/adapters/meter-pay-base.ts. */
export const METER_PAY_SNIPPET = `import { buyMeterPassBase } from "./src/adapters/meter-pay-base.ts";
await buyMeterPassBase({ from, signExact });`;

/** Paid look. No free allowance on an X-Agent-Pass id. */
export const METER_FREE_LOOK_NOTE =
  "No free looks. 402 looks_20 $0.20 pack (look $0.10 is optional one-shot) before the first scan.";

export const METER_FREE_LOOK_CURL =
  "curl -s -X POST https://agent-control.net/api/v1/meter/scan -H 'content-type: application/json' -H 'X-Agent-Pass: <your-id>' -d '{\"chain\":\"solana\",\"address\":\"<destination>\"}'";

/** Exact one-file recipe for llms.txt and /docs. Discovery: llms → pricing → 402 → MCP. */
export const METER_RECIPE = `# 1 discover
# https://agent-control.net/llms.txt
curl -s https://agent-control.net/api/v1/meter/pricing
# 2 look — ${METER_PACKS_FIRST} One address. ok | new | warn | sink
# ${METER_FREE_LOOK_NOTE}
${METER_FREE_LOOK_CURL}
# 3 POST /api/v1/meter/pass → 402 looks_20 $0.20 pack. Empty body {} = looks_20; {"sku":"look"} = $0.10 one-shot. Prefer Base USDC (EIP-3009 exact) to base_pay_to (CDP/AgentKit). No Solana key needed. Solana USDC to pay_to WITH reference is optional
curl -s -X POST https://agent-control.net/api/v1/meter/pass -H 'content-type: application/json' -d '{}'
# copy src/adapters/meter-pay-base.ts — Base EIP-3009 exact (CDP/AgentKit). We never take keys.
# https://raw.githubusercontent.com/Cobra-bit-prog/agent-guard/main/src/adapters/meter-pay-base.ts
${METER_PAY_SNIPPET}
# MCP-native (no Solana key): meter_buy_pass (looks_20) → Base sign_exact → meter_watch({invoice_id, payment}) → token → meter_scan
# Buy looks_20 pack ($0.20) → X-Agent-Pass. look $0.10 is optional one-shot. GET /api/v1/meter/pricing (paid_sku looks_20, free_looks=0). We never take keys.
# 4 watch
# Base: POST /api/v1/meter/watch with { invoice_id, payment } = full x402 v2 object from payMeterPassBase / sign_exact. NOT a raw signature string. NOT invoice_id-only for Base.
curl -s -X POST https://agent-control.net/api/v1/meter/watch -H 'content-type: application/json' -d '{"invoice_id":"inv_…","payment":{"x402Version":2,"payload":{"authorization":{},"signature":"<sig>"},"accepted":{"network":"base"}}}'
# 5 packs looks_20 $0.20 · addresses_100 $0.15 · stamp_tx $0.05 ticket
# ${METER_TICKET}
# 6 MCP meter_* at /api/v1/mcp`;

/** One-file merchant gate. Same bytes as public/stamp.txt. */
export const STAMP_RECIPE = `# Stamp seller
# ${STAMP_TXT_URL}
# ${METER_TICKET}
# Seller page: ${STAMP_URL}
# Separate from the Human App. Agents pay themselves. No inbox. No email. No API key. No Approval Inbox.
# ${METER_QUESTION} ${METER_PACKS_FIRST}
# ${METER_PACKS}
# Base USDC (EIP-3009 exact) and Solana USDC. pass_1h catalog-only.
# 1 agent buys stamp_tx $0.05 via Meter 402
${STAMP_BUY_CURL}
# 402 stamp_tx $0.05. Prefer Base USDC (EIP-3009 exact) to base_pay_to (CDP/AgentKit). No Solana key needed. Solana USDC to pay_to WITH reference is optional. We never take keys.
# copy src/adapters/meter-pay-base.ts
# https://raw.githubusercontent.com/Cobra-bit-prog/agent-guard/main/src/adapters/meter-pay-base.ts
${STAMP_BUY_SNIPPET}
# MCP: meter_buy_pass sku stamp_tx → Base sign_exact → meter_watch({invoice_id, payment}) → token
# Base: POST /api/v1/meter/watch with { invoice_id, payment } = full x402 v2 object from payMeterPassBase / sign_exact. NOT invoice_id-only for Base.
curl -s -X POST https://agent-control.net/api/v1/meter/watch -H 'content-type: application/json' -d '{"invoice_id":"inv_…","payment":{"x402Version":2,"payload":{"authorization":{},"signature":"<sig>"},"accepted":{"network":"base"}}}'
${STAMP_MINT_CURL}
# 2 merchant verifies free at ${STAMP_URL} or GET /api/v1/meter/stamp/:id or MCP meter_verify_stamp. Public. No email. No API key.
${STAMP_VERIFY_CURL}
# 3 merchant only accepts USDC if verified is true and decision is allow. If not, do not take the USDC.
# ${METER_TICKET}
# 4 dogfood gate. Live on this site. GET or POST ${GATE_DEMO_PATH}. Header ${STAMP_ID_HEADER}. No valid allow stamp → 402 stamp_tx $0.05. verified true and decision allow → 200.
${GATE_DEMO_BLOCKED_CURL}
# blocked. Buy stamp_tx, mint allow, pass the stamp id:
${GATE_DEMO_ALLOW_CURL}
# Merchant copy: src/adapters/stamp-gate.ts
# https://raw.githubusercontent.com/Cobra-bit-prog/agent-guard/main/src/adapters/stamp-gate.ts
# 5 drop-in. Header ${STAMP_ID_HEADER}. ${METER_TICKET}
# ${STAMP_SELLER_BODY}
# Next.js App Router route handler
import { requireMerchantStamp } from "./stamp-gate.ts";
export async function POST(req: Request) {
  const gate = await requireMerchantStamp(req, { seller: "your-slug" });
  if (!gate.ok) return Response.json(gate.body, { status: gate.status });
}
# Express middleware
app.use(async (req, res, next) => {
  const gate = await requireMerchantStamp(req, { seller: "your-slug" });
  if (!gate.ok) return res.status(gate.status).json(gate.body);
  return next();
});
# Hono
app.use(async (c, next) => {
  const req = c.req.raw;
  const gate = await requireMerchantStamp(req, { seller: "your-slug" });
  if (!gate.ok) return c.json(gate.body, gate.status);
  await next();
});`;

export const METER_SCAN_CURL =
  'curl -s -X POST https://agent-control.net/api/v1/meter/scan -H \'content-type: application/json\' -H \'X-Agent-Pass: <pass>\' -d \'{"chain":"solana","address":"<destination>"}\'';

export const METER_PREFLIGHT_CURL =
  'curl -s -X POST https://agent-control.net/api/v1/meter/preflight -H \'content-type: application/json\' -H \'X-Agent-Pass: <pass>\' -d \'{"chain":"solana","wallet":"<wallet>","to":"<destination>","value_usd":10,"cap_usd":100}\'';

export const METER_STEPS = [
  {
    n: "1",
    t: "Discover",
    d: "Read /llms.txt then GET pricing. Public. No key.",
    code: METER_PRICING_CURL,
  },
  {
    n: "2",
    t: "Look",
    d: `Can I pay this address? ${METER_PACKS_FIRST} ok | new | warn | sink. Never hold. No free looks. 402 looks_20 $0.20 pack before the first scan.`,
    code: METER_FREE_LOOK_CURL,
  },
  {
    n: "3",
    t: "Pay a pack",
    d: `looks_20 $0.20 pack (20 looks). look $0.10 is optional one-shot. Prefer Base USDC (EIP-3009 exact) to base_pay_to (CDP/AgentKit). No Solana key needed. Copy src/adapters/meter-pay-base.ts. Optional Solana: pay_to with the reference via meter-pay.ts. We never take keys. No Phantom. Not pass_1h.`,
    code: METER_PAY_SNIPPET,
  },
  {
    n: "4",
    t: "Watch",
    d: "Base: POST /api/v1/meter/watch with invoice_id plus the full x402 v2 payment object from payMeterPassBase / sign_exact — not a raw signature string, not invoice_id-only. Until token → X-Agent-Pass. Adapter: https://raw.githubusercontent.com/Cobra-bit-prog/agent-guard/main/src/adapters/meter-pay-base.ts",
    code: `curl -s -X POST https://agent-control.net/api/v1/meter/watch -H 'content-type: application/json' -d '{"invoice_id":"inv_…","payment":{"x402Version":2,"payload":{"authorization":{},"signature":"<sig>"},"accepted":{"network":"base"}}}'`,
  },
  {
    n: "5",
    t: "Packs and ticket",
    d: `Packs: looks_20 $0.20. addresses_100 $0.15. Ticket: stamp_tx $0.05. ${METER_TICKET} Then MCP meter_* tools.`,
    code: `${METER_SCAN_CURL}\n${METER_PREFLIGHT_CURL}`,
  },
] as const;
