import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  FEATURED_CTA,
  FEATURED_PATH,
  FEATURED_PAY_LINE,
  FEATURED_PRICE_USD,
} from "@/lib/directory/featured-copy";
import { EVM_PAYOUT_ADDRESS } from "@/lib/evm-pay";
import {
  RECEIVE_WALLET_SWITCH_ERROR,
  SOLANA_PAYOUT_ADDRESS,
  buildSolanaPayUrl,
  isReceiveWalletPayer,
  phantomBrowseUrl,
} from "@/lib/solana-pay";

type FeaturedInvoice = {
  invoice_id?: string;
  listing_id?: string;
  status?: string;
  reference?: string;
  amount_base_units?: string;
  featured_until?: string | null;
  error?: string;
};

type Props = {
  listingId: string;
  contact: string;
  onListingId: (value: string) => void;
  onContact: (value: string) => void;
  onPaid: () => void;
};

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

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
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function DirectoryFeatured({ listingId, contact, onListingId, onContact, onPaid }: Props) {
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [invoice, setInvoice] = useState<FeaturedInvoice | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"base" | "solana" | null>(null);
  const [hasPhantom, setHasPhantom] = useState(false);
  const [connectedPubkey, setConnectedPubkey] = useState<string | null>(null);

  const status = (invoice?.status ?? "").toLowerCase();
  const paid = status === "paid";
  const reference = invoice?.reference ?? "";
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  useEffect(() => {
    setInvoice(null);
    setPayError(null);
  }, [listingId]);

  useEffect(() => {
    if (!invoice?.invoice_id || paid) return;
    let cancelled = false;
    void import("@/lib/pay-extension").then((mod) => {
      if (cancelled) return;
      setHasPhantom(mod.hasPhantomExtension());
      const pubkey = mod.peekPhantomPubkey();
      if (pubkey) setConnectedPubkey(pubkey);
    });
    return () => {
      cancelled = true;
    };
  }, [invoice?.invoice_id, paid]);

  useEffect(() => {
    const id = invoice?.invoice_id;
    if (!id || paid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(FEATURED_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ invoice_id: id }),
        });
        const body = (await response.json()) as FeaturedInvoice;
        if (cancelled || !body.invoice_id) return;
        setInvoice(body);
        if ((body.status ?? "").toLowerCase() === "paid") onPaidRef.current();
      } catch {
        /* keep waiting */
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, 4000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [invoice?.invoice_id, paid]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setPayError(null);
    setPending(true);
    try {
      const response = await fetch(FEATURED_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listing_id: listingId.trim(),
          contact: contact.trim(),
          company_website: companyWebsite,
        }),
      });
      const body = (await response.json()) as FeaturedInvoice;
      if (!body.invoice_id || !body.reference) {
        throw new Error(body.error || "Could not start this payment.");
      }
      setInvoice(body);
      setCompanyWebsite("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not start this payment.");
    } finally {
      setPending(false);
    }
  }

  async function onCopy(kind: "base" | "solana", value: string) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(kind);
    setTimeout(() => setCopied(null), 1600);
  }

  async function onPay() {
    if (!reference) return;
    setBusy(true);
    setPayError(null);
    try {
      const ext = await import("@/lib/pay-extension");
      if (ext.hasPhantomExtension()) {
        const pubkey = await ext.connectPhantomPubkey();
        setConnectedPubkey(pubkey);
        await ext.payUsdcWithPhantomExtension({
          recipient: SOLANA_PAYOUT_ADDRESS,
          amountUsdc: FEATURED_PRICE_USD,
          reference,
          amountBaseUnits: invoice?.amount_base_units,
        });
        return;
      }
      const payUrl = buildSolanaPayUrl({
        amountUsdc: FEATURED_PRICE_USD,
        reference,
      });
      window.location.assign(payUrl);
    } catch (err) {
      const ext = await import("@/lib/pay-extension");
      const pubkey = ext.peekPhantomPubkey();
      if (pubkey) setConnectedPubkey(pubkey);
      if (ext.walletUserRejected(err)) {
        setPayError("Payment cancelled.");
        return;
      }
      setPayError(err instanceof Error ? err.message : "Could not send payment.");
    } finally {
      setBusy(false);
    }
  }

  const payUrl = reference
    ? buildSolanaPayUrl({ amountUsdc: FEATURED_PRICE_USD, reference })
    : "";
  const blocked = Boolean(connectedPubkey && isReceiveWalletPayer(connectedPubkey));

  return (
    <section id="featured" className="market-reveal mt-10 max-w-[36rem]">
      <h2 className="text-title font-semibold text-fg">Get featured</h2>
      <p className="mt-2 text-body text-muted">{FEATURED_PAY_LINE}</p>
      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Listing id
          <input
            className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
            value={listingId}
            onChange={(event) => onListingId(event.target.value)}
            name="listing_id"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-meta text-muted">
          Contact on that listing
          <input
            className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
            value={contact}
            onChange={(event) => onContact(event.target.value)}
            name="featured_contact"
            autoComplete="off"
            required
          />
          <span className="text-meta text-muted">Same email or https link you listed.</span>
        </label>
        <div className="absolute left-0 top-0 -z-10 h-px w-px overflow-hidden" aria-hidden="true">
          <label>
            Company website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={companyWebsite}
              onChange={(event) => setCompanyWebsite(event.target.value)}
              name="company_website"
            />
          </label>
        </div>
        {formError ? <p className="text-body text-danger">{formError}</p> : null}
        <button
          className="market-press w-full rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg disabled:opacity-60 sm:w-fit"
          type="submit"
          disabled={pending}
        >
          {pending ? "Starting…" : FEATURED_CTA}
        </button>
      </form>

      {paid && invoice?.featured_until ? (
        <p className="mt-4 text-body text-fg">Pinned until {when(invoice.featured_until)}.</p>
      ) : null}

      {invoice && !paid && reference ? (
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-body text-muted">Pay ${FEATURED_PRICE_USD} USDC. The pin starts when the payment lands.</p>
          <div className="rounded-xl border border-border bg-surface px-3 py-3">
            <p className="text-meta text-muted">Base</p>
            <p className="mt-1 break-all font-mono text-meta text-fg">{EVM_PAYOUT_ADDRESS}</p>
            <button
              type="button"
              className="mt-2 text-body text-fg underline"
              onClick={() => void onCopy("base", EVM_PAYOUT_ADDRESS)}
            >
              {copied === "base" ? "Copied" : "Copy Base address"}
            </button>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-3">
            <p className="text-meta text-muted">Solana</p>
            <p className="mt-1 break-all font-mono text-meta text-fg">{SOLANA_PAYOUT_ADDRESS}</p>
            <button
              type="button"
              className="mt-2 text-body text-fg underline"
              onClick={() => void onCopy("solana", SOLANA_PAYOUT_ADDRESS)}
            >
              {copied === "solana" ? "Copied" : "Copy Solana address"}
            </button>
          </div>
          {blocked ? <p className="text-body text-danger">{RECEIVE_WALLET_SWITCH_ERROR}</p> : null}
          <button
            type="button"
            className="market-press w-full rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg disabled:opacity-60 sm:w-fit"
            disabled={busy || blocked}
            onClick={() => void onPay()}
          >
            {busy ? "Opening Phantom…" : `Pay $${FEATURED_PRICE_USD} USDC on Solana`}
          </button>
          {!hasPhantom && payUrl ? (
            <a href={phantomBrowseUrl(payUrl)} className="text-body text-fg underline">
              Open in Phantom
            </a>
          ) : null}
          {payError ? <p className="text-body text-danger">{payError}</p> : null}
          {invoice.error ? <p className="text-body text-danger">{invoice.error}</p> : null}
          <p className="text-body text-muted">Waiting for ${FEATURED_PRICE_USD} USDC.</p>
        </div>
      ) : null}
    </section>
  );
}
