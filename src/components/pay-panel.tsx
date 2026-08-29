import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChainMark } from "@/components/chain-icons";
import { PayQr } from "@/components/pay-qr";
import { Button } from "@/components/ui/button";
import { PAY_CHAIN_LABEL, phantomBrowseUrl, type PayChain, type PayRequestView } from "@/lib/solana-pay";

export function PayPanel({ req }: { req: PayRequestView }) {
  const [copied, setCopied] = useState<"amount" | "address" | "both" | null>(null);
  const chain = (req.chain ?? "solana") as PayChain;
  const chainName = PAY_CHAIN_LABEL[chain] ?? "Solana";
  const evm = chain === "ethereum" || chain === "base";
  const sticker = String(req.amountUsdc);
  const displayAmount = evm ? req.exactAmountUsdc : sticker;
  const sendExact = evm && displayAmount !== sticker;
  const payUrl = (req.payUrl ?? "").trim();
  const qrValue = evm
    ? (req.metamaskUrl ?? "")
    : payUrl
      ? phantomBrowseUrl(payUrl)
      : "";

  async function copy(kind: "amount" | "address" | "both", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
      toast.success(
        kind === "both" ? "Amount and address copied." : kind === "amount" ? "Amount copied" : "Address copied",
      );
    } catch {
      toast.error("Could not copy. Select the amount and address on this page.");
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="mx-auto w-full max-w-[280px]">
        <PayQr
          value={qrValue}
          alt={evm ? `${chainName} USDC payment QR` : "Solana Pay QR"}
        />
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5">
          <p className="text-xs text-muted">Amount</p>
          <p className="font-medium">{sticker} USDC</p>
          {sendExact ? (
            <p className="mt-0.5 text-xs text-muted">Send exactly {displayAmount} USDC</p>
          ) : null}
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
            <ChainMark chain={chain} className="size-3.5" />
            {chainName} · USDC
          </p>
        </div>
        <div className="rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5">
          <p className="text-xs text-muted">To</p>
          <p className="break-all font-mono text-xs leading-relaxed">{req.recipient}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void copy("amount", displayAmount)}
        >
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
          onClick={() => void copy("both", `${displayAmount} USDC\n${req.recipient}`)}
        >
          <Copy />
          {copied === "both" ? "Copied amount and address" : "Copy both"}
        </Button>
      </div>
    </div>
  );
}
