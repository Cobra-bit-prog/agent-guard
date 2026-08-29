import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChainMark } from "@/components/chain-icons";
import { PayQr } from "@/components/pay-qr";
import { Button } from "@/components/ui/button";
import {
  PAY_CHAIN_LABEL,
  phantomBrowseUrl,
  type PayChain,
  type PayRequestView,
} from "@/lib/solana-pay";
import { asPayAsset } from "@/lib/pay-asset";

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

export function PayPanel({ req }: { req: PayRequestView }) {
  const [copied, setCopied] = useState<"amount" | "address" | "both" | null>(null);
  const chain = (req.chain ?? "solana") as PayChain;
  const asset = asPayAsset(req.asset);
  const symbol = req.symbol ?? "USDC";
  const chainName = PAY_CHAIN_LABEL[chain] ?? "Solana";
  const evm = asset === "eth" || chain === "ethereum" || chain === "base";
  const displayAmount = req.exactAmount ?? req.exactAmountUsdc ?? String(req.amountUsdc);
  const sendExact = asset !== "usdc" || evm;
  const payUrl = (req.payUrl ?? "").trim();
  const qrValue = evm ? (req.metamaskUrl ?? payUrl) : payUrl ? phantomBrowseUrl(payUrl) : "";

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
      <div className="mx-auto w-full max-w-[280px]">
        <PayQr value={qrValue} alt={evm ? `${chainName} USDC payment QR` : "Solana Pay QR"} />
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5">
          <p className="text-xs text-muted">Amount</p>
          <p className="font-medium">
            {displayAmount} {symbol}
          </p>
          {sendExact ? (
            <p className="mt-0.5 text-xs text-muted">
              Send exactly {displayAmount} {symbol}
            </p>
          ) : null}
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
            <ChainMark chain={chain} className="size-3.5" />
            {chainName} · {symbol}
          </p>
        </div>
        <button
          type="button"
          className="w-full rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5 text-left"
          onClick={() => void copy("address", req.recipient)}
        >
          <p className="text-xs text-muted">To</p>
          <p className="break-all font-mono text-xs leading-relaxed">{req.recipient}</p>
        </button>
        <Button type="button" className="w-full" onClick={() => void copy("amount", displayAmount)}>
          <Copy />
          {copied === "amount" ? "Copied" : "Copy amount"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void copy("address", req.recipient)}
        >
          <Copy />
          {copied === "address" ? "Copied" : "Copy address"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void copy("both", `${displayAmount} ${symbol}\n${req.recipient}`)}
        >
          <Copy />
          {copied === "both" ? "Copied amount and address" : "Copy both"}
        </Button>
      </div>
    </div>
  );
}
