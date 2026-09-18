import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  displayMeterAmount,
  parseMeterPaySearch,
  resolveMeterPayIntent,
  type MeterInvoicePayload,
  type MeterPayIntent,
  type MeterPaySearch,
} from "@/lib/meter-pay";
import { EVM_PAYOUT_ADDRESS } from "@/lib/evm-pay";
import { RECEIVE_WALLET_SWITCH_ERROR, SOLANA_PAYOUT_ADDRESS, isReceiveWalletPayer } from "@/lib/solana-pay";
import {
  SPEND_AUDIT_HEADLINE,
  SPEND_AUDIT_PATH,
  SPEND_AUDIT_PRICE_USD,
  SPEND_AUDIT_STARTER_COPY,
  SPEND_AUDIT_STARTER_HREF,
} from "@/lib/spend-audit";
import { shortAddress } from "@/lib/utils";

type AuditInvoice = MeterInvoicePayload & {
  address?: string;
  chain?: string;
  preview?: { outboundCount: number; outboundUsd: number; findings: number; summary?: string[] } | null;
  base_pay_to?: string;
};

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    window.prompt("Copy this", value);
    return false;
  }
}

async function readJson(res: Response): Promise<AuditInvoice> {
  try {
    return (await res.json()) as AuditInvoice;
  } catch {
    return { error: "Could not read response." };
  }
}

function downloadBase64(file: { filename: string; mime: string; base64: string }) {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: file.mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export function SpendAuditPayCard({ search }: { search: MeterPaySearch }) {
  const params = parseMeterPaySearch(search);
  const [invoice, setInvoice] = useState<AuditInvoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(Boolean(params.invoice_id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);
  const [hasPhantom, setHasPhantom] = useState(false);
  const [connectedPubkey, setConnectedPubkey] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [copied, setCopied] = useState<"solana" | "base" | "sig" | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const resolved = resolveMeterPayIntent({ search: params, invoice });
  const intent = resolved.ok ? resolved.intent : null;
  const status = (invoice?.status ?? "").toLowerCase();
  const paid = status === "paid";
  const expired = status === "expired";
  const amountLabel = intent ? displayMeterAmount(intent) : String(SPEND_AUDIT_PRICE_USD);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/pay-extension").then((mod) => {
      if (cancelled) return;
      setHasPhantom(mod.hasPhantomExtension());
      const pk = mod.peekPhantomPubkey();
      if (pk) setConnectedPubkey(pk);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = params.invoice_id;
    if (!id) {
      setInvoice(null);
      setLoadError(null);
      setLoadingInvoice(false);
      return;
    }
    let cancelled = false;
    setLoadingInvoice(true);
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/audit/invoice/${encodeURIComponent(id)}`);
        const data = await readJson(res);
        if (cancelled) return;
        if (!data.invoice_id && res.status === 404) {
          setLoadError(data.error || "Could not load invoice.");
          setInvoice(null);
          return;
        }
        setLoadError(null);
        setInvoice(data);
        if (data.signature) setSignature(data.signature);
      } catch {
        if (!cancelled) setLoadError("Could not load invoice.");
      } finally {
        if (!cancelled) setLoadingInvoice(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.invoice_id]);

  const invoiceId = invoice?.invoice_id || params.invoice_id || intent?.invoiceId || "";

  useEffect(() => {
    if (!invoiceId || expired || paid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/v1/audit/watch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ invoice_id: invoiceId }),
        });
        const data = await readJson(res);
        if (cancelled) return;
        if (data.invoice_id || data.status) {
          setInvoice((prev) => ({ ...prev, ...data, invoice_id: data.invoice_id || prev?.invoice_id || invoiceId }));
        }
        if (data.signature) setSignature(data.signature);
      } catch {
        /* keep waiting */
      }
    };
    const t = setInterval(() => {
      void tick();
    }, 4000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [invoiceId, expired, paid, signature]);

  async function onCopy(kind: "solana" | "base" | "sig", value: string) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  }

  async function onPay(next: MeterPayIntent) {
    setBusy(true);
    setPayError(null);
    try {
      const ext = await import("@/lib/pay-extension");
      if (ext.hasPhantomExtension()) {
        const pk = await ext.connectPhantomPubkey();
        setConnectedPubkey(pk);
        const sent = await ext.payUsdcWithPhantomExtension({
          recipient: next.recipient,
          amountUsdc: next.amountUsdc,
          reference: next.reference,
          amountBaseUnits: next.amountBaseUnits,
        });
        setSignature(sent);
        return;
      }
      window.location.assign(next.payUrl);
    } catch (err) {
      const ext = await import("@/lib/pay-extension");
      const pk = ext.peekPhantomPubkey();
      if (pk) setConnectedPubkey(pk);
      if (ext.walletUserRejected(err)) {
        setPayError("Payment cancelled.");
        return;
      }
      setPayError(err instanceof Error ? err.message : "Could not send payment.");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(format: "pdf" | "csv") {
    if (!invoiceId) return;
    setDownloading(format);
    try {
      const res = await fetch(`/api/v1/audit/report/${encodeURIComponent(invoiceId)}?format=${format}`);
      const file = (await res.json()) as { filename?: string; mime?: string; base64?: string; error?: string };
      if (!file.base64 || !file.filename || !file.mime) throw new Error(file.error || "Report is not ready.");
      downloadBase64({ filename: file.filename, mime: file.mime, base64: file.base64 });
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not download the report.");
    } finally {
      setDownloading(null);
    }
  }

  if (paid) {
    return (
      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
        <p className="text-meta font-semibold uppercase tracking-[0.16em] text-navy">Wallet Spend Audit</p>
        <h1 className="mt-2 text-title font-semibold tracking-tight">{SPEND_AUDIT_HEADLINE}</h1>
        <p className="mt-2 text-muted">Paid. Your report is ready — PDF or CSV of what would have left this wallet.</p>
        {invoice?.preview?.summary?.length ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-body text-muted">
            {invoice.preview.summary.slice(0, 3).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void onDownload("pdf")} disabled={downloading !== null}>
            {downloading === "pdf" ? "Preparing…" : "Download PDF"}
          </Button>
          <Button variant="secondary" onClick={() => void onDownload("csv")} disabled={downloading !== null}>
            {downloading === "csv" ? "Preparing…" : "Download CSV"}
          </Button>
        </div>
        <p className="mt-6 text-body text-muted">{SPEND_AUDIT_STARTER_COPY}</p>
        <a href={SPEND_AUDIT_STARTER_HREF} className="mt-3 inline-flex text-body font-semibold text-navy hover:text-coral">
          Starter $29 — Approval Inbox →
        </a>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
        <h1 className="text-title font-semibold tracking-tight">Invoice expired</h1>
        <p className="mt-2 text-muted">Start a new $49 Wallet Spend Audit from the landing page.</p>
        <Button asChild className="mt-5 h-11 w-full rounded-full">
          <a href={SPEND_AUDIT_PATH}>Paste a wallet again</a>
        </Button>
      </div>
    );
  }

  if (loadingInvoice && !intent) {
    return <div className="h-80 animate-pulse rounded-[20px] bg-elevated" />;
  }

  if (!intent) {
    return (
      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
        <h1 className="text-title font-semibold tracking-tight">Pay ${SPEND_AUDIT_PRICE_USD} USDC</h1>
        <p className="mt-2 text-muted">Open this page with an invoice from {SPEND_AUDIT_PATH}.</p>
        {loadError ? <p className="mt-3 text-body text-danger">{loadError}</p> : null}
        <Button asChild className="mt-5 h-11 w-full rounded-full">
          <a href={SPEND_AUDIT_PATH}>Paste a wallet</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
      <p className="text-meta font-semibold uppercase tracking-[0.16em] text-navy">Wallet Spend Audit</p>
      <h1 className="mt-2 text-title font-semibold tracking-tight">Pay {amountLabel} USDC</h1>
      <p className="mt-2 text-muted">
        {SPEND_AUDIT_HEADLINE}. Prefer Base EIP-3009 exact, or Solana Pay with Phantom. We unlock when it lands.
      </p>
      {invoice?.address ? (
        <p className="mt-3 break-all font-mono text-meta text-muted">
          {invoice.chain} · {invoice.address}
        </p>
      ) : null}
      {loadError ? <p className="mt-3 text-body text-danger">{loadError}</p> : null}

      <div className="mt-4 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
        <p className="text-meta text-muted">Base (EIP-3009 exact) · preferred</p>
        <p className="mt-1 break-all font-mono text-meta leading-relaxed">{EVM_PAYOUT_ADDRESS}</p>
        <button type="button" className="mt-2 text-body font-semibold text-navy" onClick={() => void onCopy("base", EVM_PAYOUT_ADDRESS)}>
          {copied === "base" ? "Copied" : "Copy Base address"}
        </button>
      </div>

      <div className="mt-3 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
        <p className="text-meta text-muted">Solana Pay · USDC with reference</p>
        <p className="mt-1 break-all font-mono text-meta leading-relaxed">{SOLANA_PAYOUT_ADDRESS}</p>
        <button
          type="button"
          className="mt-2 text-body font-semibold text-navy"
          onClick={() => void onCopy("solana", SOLANA_PAYOUT_ADDRESS)}
        >
          {copied === "solana" ? "Copied" : "Copy Solana address"}
        </button>
      </div>

      {connectedPubkey ? (
        <p className="mt-3 text-meta text-muted">Phantom {shortAddress(connectedPubkey)}</p>
      ) : null}
      {connectedPubkey && isReceiveWalletPayer(connectedPubkey) ? (
        <p className="mt-2 text-body text-danger">{RECEIVE_WALLET_SWITCH_ERROR}</p>
      ) : null}

      <button
        type="button"
        disabled={busy || Boolean(connectedPubkey && isReceiveWalletPayer(connectedPubkey))}
        onClick={() => void onPay(intent)}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-body font-semibold text-primary-fg disabled:opacity-50"
      >
        {busy ? "Opening Phantom…" : `Pay ${amountLabel} USDC on Solana`}
      </button>

      {!hasPhantom ? (
        <a
          href={intent.payUrl}
          className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-elevated px-5 text-body font-semibold text-navy"
        >
          Open in Phantom
        </a>
      ) : null}

      {payError ? <p className="mt-3 text-body text-danger">{payError}</p> : null}

      {signature ? (
        <div className="mt-4 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
          <p className="text-body font-medium text-navy">Sent. Waiting for it to land.</p>
          <p className="mt-1 break-all font-mono text-meta text-muted">{signature}</p>
        </div>
      ) : (
        <p className="mt-4 text-center text-body font-medium text-navy">Waiting for {amountLabel} USDC.</p>
      )}
      <p className="mt-3 text-center text-meta text-muted">Use a wallet. Do not send from Coinbase or Binance. You keep the keys.</p>
    </div>
  );
}
