import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChainMark } from "@/components/chain-icons";
import { PayQr } from "@/components/pay-qr";
import { Button } from "@/components/ui/button";
import {
  hasPhantomExtension,
  payUsdcWithPhantomExtension,
  walletUserRejected,
} from "@/lib/pay-extension";
import {
  PAY_CHAIN_LABEL,
  phantomBrowseUrl,
  type PayChain,
  type PayRequestView,
} from "@/lib/solana-pay";

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* iPhone Safari often throws; fall through */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    /* fall through to prompt */
  }
  const next = window.prompt("Copy this", value);
  return next !== null;
}

function isLikelyMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function SolanaPayButton({ req }: { req: PayRequestView }) {
  const [busy, setBusy] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [mobile, setMobile] = useState(false);
  const payUrl = (req.payUrl ?? "").trim();

  useEffect(() => {
    setHasWallet(hasPhantomExtension());
    setMobile(isLikelyMobile());
  }, []);

  async function pay() {
    if (busy) return;
    if (hasPhantomExtension()) {
      setBusy(true);
      try {
        await payUsdcWithPhantomExtension({
          recipient: req.recipient,
          amountUsdc: req.amountUsdc,
          reference: req.reference,
        });
        toast.success("Sent. Waiting for confirmation.");
      } catch (err) {
        if (walletUserRejected(err)) {
          toast.message("Payment cancelled.");
        } else {
          toast.error(err instanceof Error ? err.message : "Could not send USDC.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    if (payUrl && isLikelyMobile()) {
      window.location.assign(payUrl);
      return;
    }
    toast.message("No wallet in this browser. Scan the QR or copy the address below.");
  }

  return (
    <div className="space-y-2">
      <Button type="button" className="w-full" size="lg" disabled={busy} onClick={() => void pay()}>
        {busy ? "Confirm in wallet…" : `Pay ${req.amountUsdc} USDC`}
      </Button>
      {!hasWallet && payUrl ? (
        mobile ? (
          <p className="text-center text-xs text-subtle">
            Opens your Solana wallet. Or scan or copy below.
          </p>
        ) : (
          <p className="text-center text-xs text-subtle">
            Need a wallet app? Scan the QR, copy the address, or{" "}
            <a
              href={phantomBrowseUrl(payUrl)}
              className="text-primary underline-offset-4 hover:underline"
            >
              open Phantom
            </a>
            .
          </p>
        )
      ) : null}
    </div>
  );
}

export function PayPanel({ req }: { req: PayRequestView }) {
  const [copied, setCopied] = useState<"amount" | "address" | "both" | null>(null);
  const chain = (req.chain ?? "solana") as PayChain;
  const chainName = PAY_CHAIN_LABEL[chain] ?? "Solana";
  const evm = chain === "ethereum" || chain === "base";
  const sticker = String(req.amountUsdc);
  const displayAmount = evm ? req.exactAmountUsdc : sticker;
  const sendExact = evm && displayAmount !== sticker;
  const payUrl = (req.payUrl ?? "").trim();
  const qrValue = evm ? (req.metamaskUrl ?? "") : payUrl;

  async function copy(kind: "amount" | "address" | "both", value: string) {
    const ok = await copyText(value);
    if (!ok) {
      toast.error("Could not copy. Select the amount and address on this page.");
      return;
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
    toast.success(
      kind === "both"
        ? "Amount and address copied."
        : kind === "amount"
          ? "Amount copied"
          : "Address copied",
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {!evm ? <SolanaPayButton req={req} /> : null}
      <div className="space-y-3 text-sm">
        <button
          type="button"
          className="w-full rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5 text-left"
          onClick={() => void copy("amount", displayAmount)}
        >
          <p className="text-xs text-muted">Amount</p>
          <p className="font-medium">{sticker} USDC</p>
          {sendExact ? (
            <p className="mt-0.5 text-xs text-muted">Send exactly {displayAmount} USDC</p>
          ) : null}
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
            <ChainMark chain={chain} className="size-3.5" />
            {chainName} · USDC
          </p>
        </button>
        <button
          type="button"
          className="w-full rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5 text-left"
          onClick={() => void copy("address", req.recipient)}
        >
          <p className="text-xs text-muted">To</p>
          <p className="break-all font-mono text-xs leading-relaxed">{req.recipient}</p>
        </button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void copy("both", `${displayAmount} USDC\n${req.recipient}`)}
        >
          <Copy />
          {copied === "both" ? "Copied amount and address" : "Copy amount and address"}
        </Button>
      </div>
      <div className="mx-auto w-full max-w-[280px]">
        <p className="mb-2 text-center text-xs text-subtle">
          {evm ? "Or scan with your wallet" : "Or scan with any Solana wallet"}
        </p>
        <PayQr value={qrValue} alt={evm ? `${chainName} USDC payment QR` : "Solana Pay QR"} />
      </div>
    </div>
  );
}
