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
import { SOLANA_PAYOUT_ADDRESS, RECEIVE_WALLET_SWITCH_ERROR, isReceiveWalletPayer } from "@/lib/solana-pay";
import { shortAddress } from "@/lib/utils";

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

async function readJson(res: Response): Promise<MeterInvoicePayload> {
  try {
    return (await res.json()) as MeterInvoicePayload;
  } catch {
    return { error: "Could not read response." };
  }
}

function replaceInvoiceId(invoiceId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("invoice_id", invoiceId);
  url.searchParams.delete("id");
  window.history.replaceState({}, "", url);
}

export function MeterPayCard({ search }: { search: MeterPaySearch }) {
  const params = parseMeterPaySearch(search);
  const [invoice, setInvoice] = useState<MeterInvoicePayload | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(Boolean(params.invoice_id));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasPhantom, setHasPhantom] = useState(false);
  const [connectedPubkey, setConnectedPubkey] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [passToken, setPassToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<"address" | "token" | "sig" | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const resolved = resolveMeterPayIntent({ search: params, invoice });
  const intent = resolved.ok ? resolved.intent : null;
  const status = (invoice?.status ?? "").toLowerCase();
  const paid = status === "paid" || Boolean(passToken);
  const expired = status === "expired";

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
        const res = await fetch(`/api/v1/meter/invoice/${encodeURIComponent(id)}`);
        const data = await readJson(res);
        if (cancelled) return;
        if (!res.ok) {
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
    if (!invoiceId || expired || passToken) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/v1/meter/watch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ invoice_id: invoiceId }),
        });
        const data = await readJson(res);
        if (cancelled) return;
        if (data.invoice_id || data.status || data.token) {
          setInvoice((prev) => ({ ...prev, ...data, invoice_id: data.invoice_id || prev?.invoice_id || invoiceId }));
        }
        if (typeof data.token === "string" && data.token) setPassToken(data.token);
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
  }, [invoiceId, expired, signature, passToken]);

  async function onCopy(kind: "address" | "token" | "sig", value: string) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  }

  async function onCreateInvoice() {
    setCreating(true);
    setPayError(null);
    setLoadError(null);
    try {
      const res = await fetch("/api/v1/meter/pass", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await readJson(res);
      const id = data.invoice_id;
      if (!id) throw new Error(data.error || "Could not start invoice.");
      replaceInvoiceId(id);
      setInvoice(data);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not start invoice.");
    } finally {
      setCreating(false);
    }
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

  const amountLabel = intent ? displayMeterAmount(intent) : "0.02";

  if (paid) {
    return (
      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
        <p className="text-meta font-semibold uppercase tracking-[0.16em] text-navy">Meter pass</p>
        <h1 className="mt-2 text-title font-semibold tracking-tight">Paid. The pass is ready.</h1>
        <p className="mt-2 text-muted">{amountLabel} USDC landed. Use the pass token on scan and preflight.</p>
        {signature ? (
          <p className="mt-4 break-all font-mono text-meta text-muted">{signature}</p>
        ) : null}
        {passToken ? (
          <div className="mt-4 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
            <p className="text-meta text-muted">Pass token</p>
            <p className="mt-1 break-all font-mono text-meta leading-relaxed">{passToken}</p>
            <button
              type="button"
              className="mt-2 text-body font-semibold text-navy"
              onClick={() => void onCopy("token", passToken)}
            >
              {copied === "token" ? "Copied" : "Copy token"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (expired) {
    return (
      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
        <h1 className="text-title font-semibold tracking-tight">Invoice expired</h1>
        <p className="mt-2 text-muted">Start a new $0.02 look invoice, then pay with Phantom.</p>
        <Button className="mt-5 h-11 w-full rounded-full" onClick={() => void onCreateInvoice()} disabled={creating}>
          {creating ? "Starting…" : "Get a $0.02 invoice"}
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
        <p className="text-meta font-semibold uppercase tracking-[0.16em] text-navy">Meter pass</p>
        <h1 className="mt-2 text-title font-semibold tracking-tight">Pay 0.02 USDC</h1>
        <p className="mt-2 text-muted">
          Open this page with an invoice, or start one here. Phantom in Chrome can pay without scanning a
          QR.
        </p>
        {loadError ? <p className="mt-3 text-body text-danger">{loadError}</p> : null}
        {payError ? <p className="mt-3 text-body text-danger">{payError}</p> : null}
        <Button className="mt-5 h-11 w-full rounded-full" onClick={() => void onCreateInvoice()} disabled={creating}>
          {creating ? "Starting…" : "Get a $0.02 invoice"}
        </Button>
        <p className="mt-4 text-meta text-muted">
          URL shape: https://agent-control.net/meter/pay?invoice_id= plus your invoice id.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
      <p className="text-meta font-semibold uppercase tracking-[0.16em] text-navy">Meter pass</p>
      <h1 className="mt-2 text-title font-semibold tracking-tight">Pay {amountLabel} USDC</h1>
      <p className="mt-2 text-muted">
        Send {amountLabel} USDC on Solana with Phantom. We unlock when it lands.
      </p>
      {loadError ? <p className="mt-3 text-body text-danger">{loadError}</p> : null}

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] border border-border bg-elevated px-3.5 py-3">
          <dt className="text-meta text-muted">Amount</dt>
          <dd className="mt-0.5 text-card font-semibold tabular-nums">${amountLabel} USDC</dd>
        </div>
        <div className="rounded-[14px] border border-border bg-elevated px-3.5 py-3">
          <dt className="text-meta text-muted">Network</dt>
          <dd className="mt-0.5 text-card font-semibold">Solana</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
        <p className="text-meta text-muted">Pay to</p>
        <p className="mt-1 break-all font-mono text-meta leading-relaxed">{SOLANA_PAYOUT_ADDRESS}</p>
        <button
          type="button"
          className="mt-2 text-body font-semibold text-navy"
          onClick={() => void onCopy("address", SOLANA_PAYOUT_ADDRESS)}
        >
          {copied === "address" ? "Copied" : "Copy address"}
        </button>
      </div>

      {connectedPubkey ? (
        <p className="mt-3 text-meta text-muted">
          Phantom {shortAddress(connectedPubkey)}
        </p>
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
        {busy ? "Opening Phantom…" : `Pay ${amountLabel} USDC`}
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
          <button
            type="button"
            className="mt-2 text-body font-semibold text-navy"
            onClick={() => void onCopy("sig", signature)}
          >
            {copied === "sig" ? "Copied" : "Copy signature"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-center text-body font-medium text-navy">
          Waiting for {amountLabel} USDC on Solana.
        </p>
      )}
      <p className="mt-3 text-center text-meta text-muted">
        Use Phantom in this browser. Do not send from Coinbase or Binance.
      </p>
    </div>
  );
}
