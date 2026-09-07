import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { PayQr } from "@/components/pay-qr";
import { Button } from "@/components/ui/button";
import { copyFor, parseEmail, parsePaidPlan, type InvoiceView, type PaidPlanId } from "@/lib/pay-invoice";
import { PLANS } from "@/lib/plans";
import { SOLANA_PAYOUT_ADDRESS } from "@/lib/solana-pay";

type InvoicePayload = InvoiceView & { error?: string };

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

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|Android/i.test(navigator.userAgent || "");
}

async function fetchJson(url: string, init?: RequestInit): Promise<InvoicePayload> {
  const res = await fetch(url, init);
  const data = (await res.json()) as InvoicePayload;
  if (!res.ok) throw new Error(data.error || "Could not load invoice.");
  return data;
}

export function SolanaPayBlock(opts: {
  plan?: string;
  id?: string;
  email?: string | null;
  lock?: boolean;
  onPaid?: (row: InvoiceView) => void;
}) {
  const plan = parsePaidPlan(opts.plan);
  const [email, setEmail] = useState(opts.email ?? "");
  const [row, setRow] = useState<InvoiceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        if (opts.id) {
          const view = await fetchJson(
            `/api/v1/billing/invoice?id=${encodeURIComponent(opts.id)}`,
          );
          if (!cancelled) setRow(view);
          return;
        }
        const view = await fetchJson("/api/v1/billing/invoice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            plan,
            email: parseEmail(email) ?? undefined,
            human_email: parseEmail(email) ?? undefined,
          }),
        });
        if (!cancelled) {
          setRow(view);
          const url = new URL(window.location.href);
          url.searchParams.set("plan", view.plan);
          url.searchParams.set("id", view.id);
          window.history.replaceState({}, "", url);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start invoice.");
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
    };
    // Create once per plan/id. Email can be saved later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.id, plan]);

  useEffect(() => {
    if (!row || row.status === "paid" || row.status === "expired") return;
    const tick = async () => {
      try {
        const next = await fetchJson(
          `/api/v1/billing/watch?id=${encodeURIComponent(row.id)}&reference=${encodeURIComponent(row.reference)}`,
        );
        setRow(next);
        if (next.status === "paid") opts.onPaid?.(next);
      } catch {
        /* keep showing waiting */
      }
    };
    const t = setInterval(() => {
      void tick();
    }, 4000);
    void tick();
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, row?.status]);

  const copy = copyFor(PLANS[plan].price);
  const recipient = SOLANA_PAYOUT_ADDRESS;

  async function onCopy() {
    const ok = await copyText(recipient);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1600);
  }

  function onPay(e: MouseEvent<HTMLAnchorElement>) {
    if (!row?.pay_url?.startsWith("solana:")) return;
    e.preventDefault();
    const phantom = row.phantom_url;
    window.location.assign(isMobile() || !phantom ? row.pay_url : phantom);
  }

  async function onSaveEmail(e: FormEvent) {
    e.preventDefault();
    const next = parseEmail(email);
    if (!next) return;
    setSavingEmail(true);
    try {
      localStorage.setItem("ac_email", next);
      const view = await fetchJson("/api/v1/billing/invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          row
            ? { id: row.id, email: next, human_email: next }
            : { plan, email: next, human_email: next },
        ),
      });
      setRow(view);
    } finally {
      setSavingEmail(false);
    }
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }
  if (!row) {
    return <div className="h-80 animate-pulse rounded-[20px] bg-elevated" />;
  }

  const paid = row.status === "paid";
  const price = PLANS[row.plan as PaidPlanId]?.price ?? PLANS.starter.price;

  return (
    <div className="space-y-5">
      {!opts.lock && (
        <form onSubmit={(e) => void onSaveEmail(e)} className="space-y-2">
          <label className="block text-sm font-medium text-navy">Email</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-11 flex-1 rounded-full border border-border bg-white px-4 text-sm text-fg outline-none"
            />
            <Button type="submit" variant="secondary" className="rounded-full" disabled={savingEmail}>
              {savingEmail ? "Saved" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted">Email only. No card. No KYC. Guest invoice is enough.</p>
        </form>
      )}

      <div className="rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-navy">
          {PLANS[parsePaidPlan(row.plan)].name}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          {paid ? copy.done : copy.title}
        </h1>
        <p className="mt-2 text-muted">
          {paid ? "The console stays on for 30 days. No auto-renewal." : copy.body}
        </p>
        {paid ? (
          <>
            <p className="mt-4 rounded-[14px] bg-[#dcfce7] px-3.5 py-3 text-sm font-medium text-[#166534]">
              {copy.done}
            </p>
            <Button asChild className="mt-5 h-11 w-full rounded-full">
              <a href="/dashboard">Open console</a>
            </Button>
          </>
        ) : (
          <>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[14px] border border-border bg-elevated px-3.5 py-3">
                <dt className="text-xs text-muted">Amount</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">${price} USDC</dd>
              </div>
              <div className="rounded-[14px] border border-border bg-elevated px-3.5 py-3">
                <dt className="text-xs text-muted">Network</dt>
                <dd className="mt-0.5 text-lg font-semibold">Solana</dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-center">
              <div className="aspect-square w-full max-w-[220px] rounded-[16px] border border-border bg-white p-2">
                <PayQr value={row.pay_url} alt="Pay QR" />
              </div>
            </div>
            <div className="mt-4 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
              <p className="text-xs text-muted">Address</p>
              <p className="mt-1 break-all font-mono text-xs leading-relaxed">{recipient}</p>
              <button
                type="button"
                onClick={() => void onCopy()}
                className="mt-2 text-sm font-semibold text-navy"
              >
                {copied ? "Copied" : "Copy address"}
              </button>
            </div>
            <a
              href={row.pay_url}
              onClick={onPay}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg"
            >
              {copy.cta}
            </a>
            <p className="mt-4 text-center text-sm font-medium text-navy">{copy.waiting}</p>
            <p className="mt-3 text-center text-xs text-muted">{copy.warn}</p>
            <details className="mt-5 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
              <summary className="cursor-pointer text-sm font-medium text-navy">Other</summary>
              <p className="mt-2 text-sm text-muted">
                SOL and ETH sit under Other. Default is ${price} USDC on Solana. Scan or tap Pay. We
                unlock when it lands.
              </p>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
