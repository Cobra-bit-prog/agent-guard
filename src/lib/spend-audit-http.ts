import { json } from "./server/http.ts";
import { lockedSolanaUsdcRecipient } from "./solana-pay.ts";
import {
  invoiceIdFromPayment,
  readX402Payment,
  referenceFromPayment,
  settleExactEvmPayment,
  type ExactEvmSettler,
} from "./meter/x402-evm.ts";
import type { MeterChainFinder } from "./meter/settle.ts";
import {
  analyzeSpend,
  parseSpendAuditChain,
  snapshotToAuditTrail,
  spendAudit402Body,
  spendAuditFileStem,
  spendAuditPricing,
  type SpendAuditInvoice,
} from "./spend-audit.ts";
import { readSpendLookback } from "./spend-audit-chain.ts";
import { allowSpendAuditDevGrant, type SpendAuditStore } from "./spend-audit-store.ts";
import { bytesToBase64, buildCsv, buildPdf } from "./server/report-files.ts";

export type SpendAuditHttpDeps = {
  findPayment?: MeterChainFinder;
  settleExactEvm?: ExactEvmSettler;
  readTransfers?: (invoice: SpendAuditInvoice) => Promise<Parameters<typeof analyzeSpend>[0]["transfers"]>;
};

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

function proofRecord(body: Record<string, unknown>): Record<string, unknown> {
  const proof = body.proof;
  if (proof && typeof proof === "object" && !Array.isArray(proof)) return proof as Record<string, unknown>;
  return {};
}

function publicInvoiceView(invoice: SpendAuditInvoice) {
  const base = spendAudit402Body(invoice);
  return {
    ...base,
    status: invoice.status,
    signature: invoice.signature,
    paid_amount_usd: invoice.paid_amount_usd,
    expires_at: invoice.expires_at,
    error: invoice.status === "pending" || invoice.status === "underpaid" ? base.error : undefined,
    http: invoice.status === "paid" ? 200 : base.http,
    preview: invoice.snapshot
      ? {
          outboundCount: invoice.snapshot.outboundCount,
          outboundUsd: invoice.snapshot.outboundUsd,
          findings: invoice.snapshot.findings.length,
          summary: invoice.snapshot.summary,
        }
      : null,
  };
}

async function defaultStore(): Promise<SpendAuditStore> {
  const { getDefaultSpendAuditStore } = await import("./server/spend-audit-sql.ts");
  return getDefaultSpendAuditStore();
}

async function ensureReport(
  store: SpendAuditStore,
  invoice: SpendAuditInvoice,
  deps: SpendAuditHttpDeps,
): Promise<SpendAuditInvoice> {
  if (invoice.snapshot) return invoice;
  const transfers = deps.readTransfers
    ? await deps.readTransfers(invoice)
    : await readSpendLookback({
        chain: invoice.chain,
        address: invoice.address,
        lookbackDays: invoice.lookback_days,
      });
  const snapshot = analyzeSpend({
    wallet: invoice.address,
    chain: invoice.chain,
    transfers,
    lookbackDays: invoice.lookback_days,
  });
  return (await store.saveSnapshot(invoice.invoice_id, snapshot)) ?? { ...invoice, snapshot };
}

async function settleExactIfPresent(
  store: SpendAuditStore,
  request: Request,
  body: Record<string, unknown>,
  deps: SpendAuditHttpDeps,
): Promise<SpendAuditInvoice | { error: string } | null> {
  const payload = readX402Payment(request, body);
  if (!payload) return null;
  const invoiceKey =
    invoiceIdFromPayment(payload) ||
    referenceFromPayment(payload) ||
    String(body.invoice_id ?? body.invoiceId ?? body.reference ?? "").trim();
  const invoice = invoiceKey ? await store.getInvoice(invoiceKey) : null;
  if (!invoice) return { error: "unknown_invoice" };
  const settled = await settleExactEvmPayment(payload, invoice, { settler: deps.settleExactEvm });
  if (!settled.ok) return { error: settled.error };
  const paid = await store.fulfillInvoice(invoice.invoice_id, {
    signature: settled.transaction,
    amountUsdc: invoice.amount_usd,
    payer_address: settled.payer,
  });
  if (!paid) return { error: "unknown_invoice" };
  return ensureReport(store, paid, deps);
}

async function watchInvoice(
  store: SpendAuditStore,
  invoice: SpendAuditInvoice,
  deps: SpendAuditHttpDeps,
): Promise<SpendAuditInvoice> {
  if (invoice.status === "paid") return ensureReport(store, invoice, deps);
  const finder: MeterChainFinder =
    deps.findPayment ??
    (async (opts) => {
      const { findMatchingUsdcPayment } = await import("./solana-pay.server.ts");
      return findMatchingUsdcPayment(opts);
    });
  let match: Awaited<ReturnType<MeterChainFinder>> = { kind: "none" };
  try {
    match = await finder({
      reference: invoice.reference,
      recipient: lockedSolanaUsdcRecipient(invoice.pay_to),
      amountUsdc: invoice.amount_usd,
    });
  } catch {
    match = { kind: "none" };
  }
  if (match.kind === "paid") {
    const paid = await store.fulfillInvoice(invoice.invoice_id, {
      signature: match.signature,
      amountUsdc: match.amountUsdc,
    });
    if (paid) return ensureReport(store, paid, deps);
  }
  if (match.kind === "underpaid") {
    const next = await store.noteUnderpaid(invoice.invoice_id, match.signature, match.amountUsdc);
    return next ?? invoice;
  }
  return invoice;
}

function downloadPayload(invoice: SpendAuditInvoice, format: "pdf" | "csv") {
  const snapshot = invoice.snapshot;
  if (!snapshot) throw new Error("Report is not ready.");
  const trail = snapshotToAuditTrail(snapshot);
  const stem = spendAuditFileStem(invoice.address, snapshot.generatedAt);
  if (format === "csv") {
    const bytes = buildCsv(trail);
    return { filename: `${stem}.csv`, mime: "text/csv;charset=utf-8", base64: bytesToBase64(bytes) };
  }
  const bytes = buildPdf(trail);
  return { filename: `${stem}.pdf`, mime: "application/pdf", base64: bytesToBase64(bytes) };
}

export async function handleSpendAuditRequest(
  request: Request,
  pathname: string,
  store?: SpendAuditStore,
  deps: SpendAuditHttpDeps = {},
): Promise<Response> {
  const resolved = store ?? (await defaultStore());
  const path = pathname.replace(/\/+$/, "");
  const suffix = path.replace(/^\/api\/v1\/audit\/?/, "");

  if (request.method === "GET" && (suffix === "pricing" || suffix === "")) {
    return json(spendAuditPricing());
  }

  if (request.method === "GET" && suffix.startsWith("invoice/")) {
    const invoice = await resolved.getInvoice(suffix.slice("invoice/".length));
    if (!invoice) return json({ error: "unknown_invoice" }, 404);
    return json(publicInvoiceView(invoice), invoice.status === "paid" ? 200 : 402);
  }

  if (request.method === "GET" && suffix.startsWith("report/")) {
    const rest = suffix.slice("report/".length);
    const [id, maybeFormat] = rest.split("/");
    const url = new URL(request.url);
    const format = (maybeFormat || url.searchParams.get("format") || "pdf").toLowerCase();
    const invoice = id ? await resolved.getInvoice(id) : null;
    if (!invoice) return json({ error: "unknown_invoice" }, 404);
    if (invoice.status !== "paid") return json(publicInvoiceView(invoice), 402);
    const ready = await ensureReport(resolved, invoice, deps);
    if (format !== "pdf" && format !== "csv") return json({ error: "format must be pdf or csv" }, 400);
    return json(downloadPayload(ready, format));
  }

  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = parseBody(await request.json());
    } catch {
      body = {};
    }
  }

  if (request.method === "POST" && (suffix === "invoice" || suffix === "")) {
    const address = String(body.address ?? body.wallet ?? "").trim();
    if (!address) return json({ error: "Paste a Solana or EVM wallet address." }, 400);
    const chain = parseSpendAuditChain(body.chain, address);
    if (typeof chain !== "string") return json({ error: "invalid_address", reason: chain.error }, 400);
    const invoice = await resolved.createInvoice({ address, chain });
    return json(publicInvoiceView(invoice), 402);
  }

  if (request.method === "POST" && suffix === "watch") {
    const proof = proofRecord(body);
    const proofType = String(proof.type ?? body.proof_type ?? "").toLowerCase();
    if (proofType === "dev" && allowSpendAuditDevGrant()) {
      const address = String(body.address ?? body.wallet ?? "").trim();
      const existingKey = String(body.invoice_id ?? body.invoiceId ?? body.reference ?? "").trim();
      let invoice = existingKey ? await resolved.getInvoice(existingKey) : null;
      if (!invoice) {
        if (!address) return json({ error: "Paste a Solana or EVM wallet address." }, 400);
        const chain = parseSpendAuditChain(body.chain, address);
        if (typeof chain !== "string") return json({ error: "invalid_address", reason: chain.error }, 400);
        invoice = await resolved.createInvoice({ address, chain });
      }
      const paid = await resolved.fulfillInvoice(invoice.invoice_id, {
        signature: "dev",
        amountUsdc: invoice.amount_usd,
        payer_address: typeof body.payer_address === "string" ? body.payer_address : null,
      });
      if (!paid) return json({ error: "unknown_invoice" }, 404);
      const ready = await ensureReport(resolved, paid, deps);
      return json({ ...publicInvoiceView(ready), status: "paid" });
    }

    const settled = await settleExactIfPresent(resolved, request, body, deps);
    if (settled && "error" in settled) return json({ error: settled.error }, 400);
    if (settled && "invoice_id" in settled) {
      return json({ ...publicInvoiceView(settled), status: "paid" });
    }

    const invoiceKey = String(body.invoice_id ?? body.invoiceId ?? body.reference ?? "").trim();
    if (!invoiceKey) return json({ error: "Provide invoice_id." }, 400);
    const invoice = await resolved.getInvoice(invoiceKey);
    if (!invoice) return json({ error: "unknown_invoice" }, 404);
    const watched = await watchInvoice(resolved, invoice, deps);
    if (watched.status === "paid") {
      return json({ ...publicInvoiceView(watched), status: "paid" });
    }
    return json(publicInvoiceView(watched), 402);
  }

  return json({ error: "unknown_audit_route", usage: spendAuditPricing().endpoints }, 404);
}
