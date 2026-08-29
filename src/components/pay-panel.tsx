import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChainMark } from "@/components/chain-icons";
import { PayQr } from "@/components/pay-qr";
import { Button } from "@/components/ui/button";
import {
  hasEthereumExtension,
  hasPhantomExtension,
  payUsdcWithEthereumExtension,
  payUsdcWithPhantomExtension,
  walletUserRejected,
} from "@/lib/pay-extension";
import { PAY_CHAIN_LABEL, phantomBrowseUrl, type PayChain, type PayRequestView } from "@/lib/solana-pay";
import { shortAddress } from "@/lib/utils";

function NetworkLabel({ chain }: { chain: PayChain }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChainMark chain={chain} className="size-4" />
      {PAY_CHAIN_LABEL[chain]}
    </span>
  );
}

export function PayPanel({ req }: { req: PayRequestView }) {
  const [copied, setCopied] = useState<"amount" | "address" | "both" | null>(null);
  const [busy, setBusy] = useState(false);
  const [injected, setInjected] = useState({ phantom: false, ethereum: false });
  const chain = (req.chain ?? "solana") as PayChain;
  const chainName = PAY_CHAIN_LABEL[chain] ?? "Solana";
  const evm = chain === "ethereum" || chain === "base";
  const sticker = String(req.amountUsdc);
  const displayAmount = evm ? req.exactAmountUsdc : sticker;
  const sendExact = evm && displayAmount !== sticker;
  const payUrl = (req.payUrl ?? "").trim();
  const walletHref = evm
    ? req.metamaskUrl || "https://link.metamask.io"
    : payUrl
      ? phantomBrowseUrl(payUrl)
      : "https://phantom.app/download";
  const usePhantomExt = !evm && injected.phantom;
  const useEthExt = evm && injected.ethereum;

  useEffect(() => {
    setInjected({
      phantom: hasPhantomExtension(),
      ethereum: hasEthereumExtension(),
    });
  }, []);

  async function copy(kind: "amount" | "address" | "both", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
      toast.success(
        kind === "both"
          ? "Amount and address copied. Paste them in the Phantom or MetaMask app."
          : kind === "amount"
            ? "Amount copied"
            : "Address copied",
      );
    } catch {
      toast.error("Could not copy. Select the amount and address on this page.");
    }
  }

  function onOpenWallet() {
    void copy("both", `${displayAmount} USDC\n${req.recipient}`);
  }

  async function onPayWithExtension() {
    if (busy) return;
    setBusy(true);
    try {
      if (usePhantomExt) {
        await payUsdcWithPhantomExtension({
          recipient: req.recipient,
          amountUsdc: req.amountUsdc,
          reference: req.reference,
        });
        toast.success("Sent to Phantom. Confirm in the wallet. We'll watch the chain.");
      } else {
        await payUsdcWithEthereumExtension({
          chain: chain === "base" ? "base" : "ethereum",
          recipient: req.recipient,
          amountBaseUnits: req.amountBaseUnits,
        });
        toast.success("Sent to your wallet. Confirm there. We'll watch the chain.");
      }
    } catch (err) {
      if (walletUserRejected(err)) {
        toast.error("Wallet request was rejected.");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not open the wallet.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(240px,280px)_1fr]">
      <div className="mx-auto flex w-full min-h-[240px] max-w-[280px] justify-center">
        <PayQr
          value={
            evm
              ? (req.metamaskUrl ?? "")
              : payUrl
                ? phantomBrowseUrl(payUrl)
                : ""
          }
          alt={evm ? `${chainName} USDC payment QR` : "Solana Pay QR"}
        />
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted">
          You don't need a wallet in Safari. Open the Phantom or MetaMask app, or copy
          amount and address.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5">
          <div>
            <p className="text-xs text-muted">Amount</p>
            <p className="font-medium">{sticker} USDC</p>
            {sendExact ? (
              <p className="mt-0.5 text-xs text-muted">Send exactly {displayAmount} USDC</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copy("amount", displayAmount)}
          >
            <Copy />
            {copied === "amount" ? "Copied" : "Copy amount"}
          </Button>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Network</span>
          <NetworkLabel chain={chain} />
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Token</span>
          <span>USDC</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-elevated/50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs text-muted">To</p>
            <p className="truncate font-mono text-xs">{shortAddress(req.recipient, 4)}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copy("address", req.recipient)}
          >
            <Copy />
            {copied === "address" ? "Copied" : "Copy address"}
          </Button>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void copy("both", `${displayAmount} USDC\n${req.recipient}`)}
        >
          <Copy />
          {copied === "both" ? "Copied amount and address" : "Copy amount and address"}
        </Button>
        {evm ? (
          <>
            {useEthExt ? (
              <Button className="w-full" type="button" disabled={busy} onClick={() => void onPayWithExtension()}>
                {busy ? "Opening wallet…" : "Open in MetaMask"}
              </Button>
            ) : (
              <Button className="w-full" asChild>
                <a
                  href={walletHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onOpenWallet}
                >
                  Open in MetaMask
                </a>
              </Button>
            )}
            <p className="text-center text-xs text-subtle">
              {useEthExt
                ? "Pays in the wallet window already in this browser. You pay network gas. We'll watch the chain."
                : "Opens the MetaMask app. USDC only. You pay network gas. Or scan the QR from a second device."}
            </p>
          </>
        ) : (
          <>
            {usePhantomExt ? (
              <Button className="w-full" type="button" disabled={busy} onClick={() => void onPayWithExtension()}>
                {busy ? "Opening Phantom…" : "Open in Phantom"}
              </Button>
            ) : (
              <Button className="w-full" asChild>
                <a
                  href={walletHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onOpenWallet}
                >
                  Open in Phantom
                </a>
              </Button>
            )}
            <p className="text-center text-xs text-subtle">
              {usePhantomExt
                ? "Pays in the Phantom window already in this browser. We'll watch the chain."
                : "Opens the Phantom app. Or scan the QR from a second device."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
