import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { SupportedChains } from "@/components/chain-icons";
import { Button } from "@/components/ui/button";
import {
  SPEND_AUDIT_HEADLINE,
  SPEND_AUDIT_HONESTY,
  SPEND_AUDIT_LEDE,
  SPEND_AUDIT_PAY29_CTA,
  SPEND_AUDIT_PAY_PATH,
  SPEND_AUDIT_PRICE_USD,
  SPEND_AUDIT_PRODUCT,
  SPEND_AUDIT_SCANNER,
  SPEND_AUDIT_STARTER_HREF,
  SPEND_AUDIT_TRIAL_CTA,
  SPEND_AUDIT_TRIAL_HREF,
  SPEND_AUDIT_UPSELL,
} from "@/lib/spend-audit";

export const Route = createFileRoute("/spend-audit/")({
  component: SpendAuditPage,
  head: () => ({
    meta: [
      { title: `${SPEND_AUDIT_PRODUCT} — ${SPEND_AUDIT_HEADLINE}` },
      {
        name: "description",
        content: `${SPEND_AUDIT_HEADLINE}. ${SPEND_AUDIT_LEDE} ${SPEND_AUDIT_PRODUCT} $${SPEND_AUDIT_PRICE_USD} USDC. ${SPEND_AUDIT_SCANNER} ${SPEND_AUDIT_HONESTY}`,
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: `${SPEND_AUDIT_PRODUCT} — ${SPEND_AUDIT_HEADLINE}` },
      {
        property: "og:description",
        content: `${SPEND_AUDIT_LEDE} $${SPEND_AUDIT_PRICE_USD} USDC. ${SPEND_AUDIT_SCANNER} ${SPEND_AUDIT_HONESTY}`,
      },
    ],
  }),
});

function SpendAuditPage() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<"auto" | "solana" | "base" | "ethereum">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/audit/invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          chain: chain === "auto" ? undefined : chain,
        }),
      });
      const data = (await res.json()) as { invoice_id?: string; error?: string };
      if (!data.invoice_id) throw new Error(data.error || "Could not start the audit invoice.");
      window.location.assign(`${SPEND_AUDIT_PAY_PATH}?invoice_id=${encodeURIComponent(data.invoice_id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the audit invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 pb-20 pt-8 md:px-10">
      <p className="text-meta font-medium uppercase tracking-[0.18em] text-coral">
        {SPEND_AUDIT_PRODUCT} · ${SPEND_AUDIT_PRICE_USD} USDC
      </p>
      <h1 className="mt-3 text-display font-semibold">{SPEND_AUDIT_HEADLINE}</h1>
      <p className="mt-4 max-w-[46ch] text-body leading-snug text-muted">{SPEND_AUDIT_LEDE}</p>
      <p className="mt-3 max-w-[46ch] text-body leading-snug text-muted">{SPEND_AUDIT_HONESTY}</p>
      <p className="mt-2 max-w-[46ch] text-body leading-snug text-muted">{SPEND_AUDIT_SCANNER}</p>
      <SupportedChains className="mt-5" />

      <form
        onSubmit={(e) => void onStart(e)}
        className="mt-8 space-y-4 rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
      >
        <label className="block space-y-1.5">
          <span className="text-meta font-medium">Wallet address</span>
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Solana or 0x…"
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 font-mono text-sm"
            autoComplete="off"
            name="address"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-meta font-medium">Chain</span>
          <select
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
            value={chain}
            onChange={(e) => setChain(e.target.value as typeof chain)}
            name="chain"
          >
            <option value="auto">Detect from address</option>
            <option value="solana">Solana</option>
            <option value="base">Base</option>
            <option value="ethereum">Ethereum</option>
          </select>
        </label>
        {error ? <p className="text-body text-danger">{error}</p> : null}
        <Button type="submit" size="lg" className="h-12 w-full rounded-full" disabled={busy || !address.trim()}>
          {busy ? "Starting…" : `Pay $${SPEND_AUDIT_PRICE_USD} USDC`}
        </Button>
        <p className="text-meta text-muted">
          {SPEND_AUDIT_SCANNER} {SPEND_AUDIT_HONESTY}
        </p>
      </form>

      <div className="mt-8 rounded-[20px] border border-border bg-elevated p-5">
        <p className="text-body">{SPEND_AUDIT_UPSELL}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild className="rounded-full">
            <a href={SPEND_AUDIT_TRIAL_HREF}>{SPEND_AUDIT_TRIAL_CTA}</a>
          </Button>
          <Button asChild variant="secondary" className="rounded-full">
            <a href={SPEND_AUDIT_STARTER_HREF}>{SPEND_AUDIT_PAY29_CTA}</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
