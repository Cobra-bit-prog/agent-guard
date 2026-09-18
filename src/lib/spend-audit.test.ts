import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EVM_PAYOUT_ADDRESS } from "./evm-pay.ts";
import { SCAN_SINK_FIXTURE } from "./meter/denylist.ts";
import { SOLANA_PAYOUT_ADDRESS } from "./solana-pay.ts";
import { handleSpendAuditRequest } from "./spend-audit-http.ts";
import {
  SPEND_AUDIT_AMOUNT_BASE_UNITS,
  SPEND_AUDIT_HEADLINE,
  SPEND_AUDIT_HONESTY,
  SPEND_AUDIT_LEDE,
  SPEND_AUDIT_PATH,
  SPEND_AUDIT_PRICE_USD,
  SPEND_AUDIT_SCANNER,
  SPEND_AUDIT_SKU,
  SPEND_AUDIT_UPSELL,
  analyzeSpend,
  inferSpendAuditChain,
  snapshotToAuditTrail,
  spendAudit402Body,
  spendAuditFileStem,
  spendAuditPricing,
} from "./spend-audit.ts";
import { createSpendAuditStore } from "./spend-audit-store.ts";
import { buildCsv, buildPdf } from "./server/report-files.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = "https://agent-control.net";
const SOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const EVM = "0x7a3b91c92d4e11a8b0f6e4c8a1d2b3c4d5e6f701";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return new Request(`${ORIGIN}${path}`, { method: "GET" });
}

describe("Wallet Spend Audit catalog", () => {
  it("is a $49 one-shot with locked payouts, not Meter and not Growth", () => {
    const pricing = spendAuditPricing();
    assert.equal(pricing.product, "Wallet Spend Audit");
    assert.equal(pricing.sku, SPEND_AUDIT_SKU);
    assert.equal(pricing.price_usd, 49);
    assert.equal(SPEND_AUDIT_PRICE_USD, 49);
    assert.equal(SPEND_AUDIT_AMOUNT_BASE_UNITS, "49000000");
    assert.equal(pricing.pay_to, SOLANA_PAYOUT_ADDRESS);
    assert.equal(pricing.base_pay_to, EVM_PAYOUT_ADDRESS);
    assert.equal(pricing.starter.price_usd, 29);
    assert.equal(pricing.starter.href, "/billing/pay?plan=starter");
    assert.equal(pricing.starter.copy, SPEND_AUDIT_UPSELL);
    assert.match(pricing.lede, /Within policy = auto/);
    assert.equal(pricing.note, SPEND_AUDIT_HONESTY);
    assert.match(pricing.note, /Meter is separate/);
    assert.equal(pricing.scanner, SPEND_AUDIT_SCANNER);
    assert.doesNotMatch(pricing.note, /cheaper/i);
    assert.doesNotMatch(JSON.stringify(pricing), /plan=growth/);
    assert.doesNotMatch(JSON.stringify(pricing), /looks_20/);
  });

  it("locks 402 pay_to even if the invoice row is hostile", () => {
    const body = spendAudit402Body({
      invoice_id: "aud_test",
      reference: "HF57Ln9oqXT22zgj2b4fBsbVoMtPndE6rYmAMVhs78Yj",
      sku: SPEND_AUDIT_SKU,
      pay_to: "WrongWalletDoNotUse111111111111111111111",
      base_pay_to: "0x000000000000000000000000000000000000dEaD",
      amount_usd: 49,
      amount_base_units: "49000000",
      chain: "solana",
      address: SOL,
      lookback_days: 30,
      asset: "usdc",
      status: "pending",
      signature: null,
      paid_amount_usd: null,
      payer_address: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      paid_at: null,
      snapshot: null,
    });
    assert.equal(body.pay_to, SOLANA_PAYOUT_ADDRESS);
    assert.equal(body.base_pay_to, EVM_PAYOUT_ADDRESS);
    assert.equal(body.accepts[0]?.payTo, EVM_PAYOUT_ADDRESS);
    assert.equal(body.accepts[1]?.payTo, SOLANA_PAYOUT_ADDRESS);
    assert.match(body.pay_url, new RegExp(`^solana:${SOLANA_PAYOUT_ADDRESS}`));
    assert.doesNotMatch(body.pay_url, /WrongWallet/);
    assert.equal(body.accepts[0]?.extra.assetTransferMethod, "eip3009");
    assert.equal(body.sku, "wallet_spend_audit");
    assert.equal(body.note, SPEND_AUDIT_HONESTY);
    assert.equal(body.starter.copy, SPEND_AUDIT_UPSELL);
    assert.match(body.note, /Meter is separate/);
    assert.doesNotMatch(body.note, /cheaper/i);
  });

  it("infers Solana vs EVM from the pasted address", () => {
    assert.equal(inferSpendAuditChain(SOL), "solana");
    assert.equal(inferSpendAuditChain(EVM), "base");
    assert.equal(inferSpendAuditChain("not-an-address"), null);
  });
});

describe("spend lookback findings", () => {
  const now = Date.parse("2026-09-18T12:00:00.000Z");

  it("flags over-cap days, unknown destinations, and sink-like addresses", () => {
    const snapshot = analyzeSpend({
      wallet: SOL,
      chain: "solana",
      nowMs: now,
      transfers: [
        {
          hash: "sig1",
          from: SOL,
          to: SCAN_SINK_FIXTURE,
          valueUsd: 80,
          timestamp: "2026-09-18T10:00:00.000Z",
          status: "success",
          kind: "USDC",
        },
        {
          hash: "sig2",
          from: SOL,
          to: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
          valueUsd: 40,
          timestamp: "2026-09-18T11:00:00.000Z",
          status: "success",
          kind: "USDC",
        },
      ],
    });
    assert.ok(snapshot.findings.some((f) => f.kind === "over_cap"));
    assert.ok(snapshot.findings.some((f) => f.kind === "sink"));
    assert.ok(snapshot.findings.some((f) => f.kind === "unknown_destination"));
    assert.equal(snapshot.outboundCount, 2);
    assert.equal(snapshot.outboundUsd, 120);
    assert.match(snapshot.disclaimer, /hypothetical \$100\/day/);
    assert.match(snapshot.summary.join(" "), /Started on Starter\?/);
    assert.match(snapshot.summary.join(" "), /Meter is separate/);
    assert.equal(spendAuditFileStem(SOL, snapshot.generatedAt).startsWith("wallet-spend-audit-"), true);
  });

  it("does not flag zero-value days as over-cap", () => {
    const snapshot = analyzeSpend({
      wallet: SOL,
      chain: "solana",
      nowMs: now,
      transfers: [
        {
          hash: "dust",
          from: SOL,
          to: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
          valueUsd: 0,
          timestamp: "2026-09-18T10:00:00.000Z",
          status: "success",
          kind: "SOL",
        },
      ],
    });
    assert.equal(snapshot.outboundCount, 0);
    assert.equal(snapshot.outboundUsd, 0);
    assert.equal(snapshot.findings.some((f) => f.kind === "over_cap"), false);
  });

  it("builds PDF and CSV from the snapshot", () => {
    const snapshot = analyzeSpend({
      wallet: EVM,
      chain: "base",
      nowMs: now,
      transfers: [
        {
          hash: "0xabc",
          from: EVM,
          to: "0x000000000000000000000000000000000000dEaD",
          valueUsd: 12,
          timestamp: "2026-09-17T10:00:00.000Z",
          status: "success",
          kind: "USDC",
        },
      ],
    });
    const trail = snapshotToAuditTrail(snapshot);
    const pdf = new TextDecoder("latin1").decode(buildPdf(trail));
    assert.match(pdf, /^%PDF-1\./);
    assert.match(pdf, /External audit for your agents/);
    assert.match(pdf, /%%EOF/);
    const csv = new TextDecoder().decode(buildCsv(trail));
    assert.match(csv, /^Time,Kind,Chain,To,Amount,Result,Detail\n/);
    assert.match(csv, /sink/);
  });
});

describe("spend audit HTTP", () => {
  it("GET pricing is public and does not mint an invoice", async () => {
    const store = createSpendAuditStore();
    const res = await handleSpendAuditRequest(get("/api/v1/audit/pricing"), "/api/v1/audit/pricing", store);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sku: string; price_usd: number; pay_to: string; base_pay_to: string };
    assert.equal(body.sku, "wallet_spend_audit");
    assert.equal(body.price_usd, 49);
    assert.equal(body.pay_to, SOLANA_PAYOUT_ADDRESS);
    assert.equal(body.base_pay_to, EVM_PAYOUT_ADDRESS);
  });

  it("POST invoice returns a $49 402 with locked wallets", async () => {
    const store = createSpendAuditStore();
    const res = await handleSpendAuditRequest(
      post("/api/v1/audit/invoice", { address: SOL, chain: "solana" }),
      "/api/v1/audit/invoice",
      store,
    );
    assert.equal(res.status, 402);
    const body = (await res.json()) as {
      sku: string;
      amount_usd: number;
      pay_to: string;
      base_pay_to: string;
      invoice_id: string;
      address: string;
    };
    assert.equal(body.sku, "wallet_spend_audit");
    assert.equal(body.amount_usd, 49);
    assert.equal(body.pay_to, SOLANA_PAYOUT_ADDRESS);
    assert.equal(body.base_pay_to, EVM_PAYOUT_ADDRESS);
    assert.equal(body.address, SOL);
    assert.match(body.invoice_id, /^aud_/);
  });

  it("rejects invalid addresses without creating an invoice", async () => {
    const store = createSpendAuditStore();
    const res = await handleSpendAuditRequest(
      post("/api/v1/audit/invoice", { address: "nope" }),
      "/api/v1/audit/invoice",
      store,
    );
    assert.equal(res.status, 400);
  });

  it("dev grant fulfills and returns a downloadable report", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      const store = createSpendAuditStore();
      const res = await handleSpendAuditRequest(
        post("/api/v1/audit/watch", {
          address: SOL,
          chain: "solana",
          proof: { type: "dev" },
        }),
        "/api/v1/audit/watch",
        store,
        {
          readTransfers: async () => [
            {
              hash: "sig",
              from: SOL,
              to: SCAN_SINK_FIXTURE,
              valueUsd: 150,
              timestamp: new Date().toISOString(),
              status: "success",
              kind: "USDC",
            },
          ],
        },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        status: string;
        invoice_id: string;
        preview: { outboundCount: number; findings: number };
      };
      assert.equal(body.status, "paid");
      assert.equal(body.preview.outboundCount, 1);
      assert.ok(body.preview.findings >= 1);

      const pdf = await handleSpendAuditRequest(
        get(`/api/v1/audit/report/${body.invoice_id}?format=pdf`),
        `/api/v1/audit/report/${body.invoice_id}`,
        store,
      );
      assert.equal(pdf.status, 200);
      const file = (await pdf.json()) as { filename: string; mime: string; base64: string };
      assert.match(file.filename, /wallet-spend-audit-/);
      assert.equal(file.mime, "application/pdf");
      assert.ok(file.base64.length > 40);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("locks CoS / Marketing customer copy on every spend-audit surface", () => {
    assert.equal(SPEND_AUDIT_HEADLINE, "External audit for your agents");
    assert.equal(
      SPEND_AUDIT_LEDE,
      "They ask before they pay. You keep the keys. Within policy = auto. Outside policy = stop.",
    );
    assert.equal(SPEND_AUDIT_HONESTY, "You keep the keys. Meter is separate — never mix.");
    assert.equal(SPEND_AUDIT_SCANNER, "Not a package scanner.");
    assert.equal(
      SPEND_AUDIT_UPSELL,
      "Started on Starter? Wallet Spend Audit adds clearer audit reports when you need proof of what your agents tried to pay.",
    );
    assert.equal(SPEND_AUDIT_PATH, "/spend-audit");
    const customer = [SPEND_AUDIT_HEADLINE, SPEND_AUDIT_LEDE, SPEND_AUDIT_HONESTY, SPEND_AUDIT_SCANNER, SPEND_AUDIT_UPSELL].join(
      " ",
    );
    assert.match(customer, /Meter is separate — never mix/);
    assert.doesNotMatch(customer, /Checks before they pay/);
    assert.doesNotMatch(customer, /Your limits stop a spend/);
    assert.doesNotMatch(customer, /cheaper/i);
    assert.doesNotMatch(customer, /looks_20/);
    assert.doesNotMatch(customer, /First 5 free/);
    assert.doesNotMatch(customer, /Agent Meter/);
    assert.doesNotMatch(customer, /plan=growth/);
  });

  it("does not retarget pay_to from query strings on the landing route", () => {
    const landing = readFileSync(join(ROOT, "src/routes/spend-audit.index.tsx"), "utf8");
    const pay = readFileSync(join(ROOT, "src/routes/spend-audit.pay.tsx"), "utf8");
    const enrolled = readFileSync(join(ROOT, "src/routes/_app/audit.tsx"), "utf8");
    const docs = readFileSync(join(ROOT, "src/routes/docs.tsx"), "utf8");
    const card = readFileSync(join(ROOT, "src/components/spend-audit-pay-card.tsx"), "utf8");
    const ui = landing + pay + enrolled + docs + card;
    assert.match(landing, /SPEND_AUDIT_HEADLINE/);
    assert.match(landing, /SPEND_AUDIT_LEDE/);
    assert.match(landing, /SPEND_AUDIT_HONESTY/);
    assert.match(landing, /SPEND_AUDIT_SCANNER/);
    assert.match(landing, /SPEND_AUDIT_UPSELL/);
    assert.match(enrolled, /SPEND_AUDIT_UPSELL/);
    assert.match(enrolled, /SPEND_AUDIT_PATH/);
    assert.doesNotMatch(ui, /Checks before they pay/);
    assert.doesNotMatch(ui, /Your limits stop a spend/);
    assert.doesNotMatch(ui, /cheaper/i);
    assert.doesNotMatch(landing + pay, /search\.pay_to/);
    assert.doesNotMatch(landing, /First 5 free/);
    assert.doesNotMatch(landing, /Agent Meter/);
    assert.doesNotMatch(landing, /plan=growth/);
    assert.match(landing, /SPEND_AUDIT_STARTER_HREF/);
    assert.match(landing, /text-body leading-snug text-muted">\{SPEND_AUDIT_LEDE\}/);
    assert.match(landing, /text-body">\{SPEND_AUDIT_UPSELL\}/);
    assert.doesNotMatch(landing, /text-card/);
    assert.match(landing, /text-meta font-medium">Wallet address/);
    assert.match(landing, /text-meta font-medium">Chain/);
    assert.doesNotMatch(landing, /<span className="text-sm /);
    const catalog = readFileSync(join(ROOT, "src/lib/spend-audit.ts"), "utf8");
    assert.match(catalog, /SPEND_AUDIT_STARTER_HREF = CONNECT_PAY_HREF/);
    assert.match(catalog, /SPEND_AUDIT_PATH = "\/spend-audit"/);
    assert.match(catalog, /Started on Starter\?/);
    assert.doesNotMatch(catalog, /Then Starter \$29/);
    assert.doesNotMatch(card, /Agent Meter/);
    assert.doesNotMatch(card, /cheaper/i);
    assert.doesNotMatch(card, /First 5 free/);
    const paid = card.slice(card.indexOf("if (paid)"), card.indexOf("if (expired)"));
    assert.match(paid, /SPEND_AUDIT_UPSELL/);
    assert.match(paid, /SPEND_AUDIT_HONESTY/);
    assert.match(paid, /SPEND_AUDIT_TRIAL_HREF/);
    assert.match(paid, /SPEND_AUDIT_TRIAL_CTA/);
    assert.match(paid, /SPEND_AUDIT_STARTER_HREF/);
    assert.match(paid, /SPEND_AUDIT_PAY29_CTA/);
    assert.match(paid, /text-body text-muted">\{SPEND_AUDIT_UPSELL\}/);
    assert.match(paid, /text-body text-muted">\{SPEND_AUDIT_HONESTY\}/);
    assert.match(paid, /text-body font-semibold text-navy/);
    assert.doesNotMatch(paid, /text-card/);
    assert.doesNotMatch(paid, /text-\[\d+px\]/);
  });
});

describe("Growth is not a billing plan", () => {
  it("paid plans stay starter / pro / team", () => {
    const plans = readFileSync(join(ROOT, "src/lib/plans.ts"), "utf8");
    const invoice = readFileSync(join(ROOT, "src/lib/pay-invoice.ts"), "utf8");
    assert.match(plans, /starter:/);
    assert.match(plans, /pro:/);
    assert.match(plans, /team:/);
    assert.doesNotMatch(plans, /growth:/);
    assert.match(invoice, /\["starter", "pro", "team"\]/);
    assert.doesNotMatch(invoice, /growth/);
  });
});
