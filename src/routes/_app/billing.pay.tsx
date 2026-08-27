import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPayRequest, watchPayRequest } from "@/lib/server/solana-billing";
import { PLANS, type PlanId } from "@/lib/plans";
import { PAY_CHAIN_LABEL, type PayChain } from "@/lib/solana-pay";
import { shortAddress } from "@/lib/utils";

export const Route = createFileRoute("/_app/billing/pay")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : "",
  }),
  component: PayRequestPage,
});

function PayQr({ value, alt }: { value: string; alt: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&ecc=M&margin=10&data=${encodeURIComponent(value)}`;
  return (
    <img
      src={src}
      alt={alt}
      width={220}
      height={220}
      className="rounded-lg bg-white p-2"
    />
  );
}

function PayRequestPage() {
  const { id } = Route.useSearch();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<"amount" | "address" | null>(null);

  const q = useQuery({
    queryKey: ["pay-request", id],
    queryFn: () => getPayRequest({ data: { id } }),
    enabled: Boolean(id),
  });

  const watch = useMutation({
    mutationFn: () => watchPayRequest({ data: { id } }),
    onSuccess: (row) => {
      void qc.setQueryData(["pay-request", id], row);
      if (row.status === "paid") void qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  useEffect(() => {
    if (!id) return;
    const row = q.data;
    if (!row || row.status === "paid" || row.status === "expired") return;
    const t = setInterval(() => {
      watch.mutate();
    }, 4000);
    watch.mutate();
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, q.data?.status]);

  if (!id) return <Navigate to="/billing" />;
  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.isError) {
    return (
      <p className="text-sm text-danger">
        {(q.error as Error).message}{" "}
        <Link to="/billing" className="underline">
          Back to billing
        </Link>
      </p>
    );
  }
  const req = q.data!;
  const plan = PLANS[(req.plan as PlanId) in PLANS ? (req.plan as PlanId) : "starter"];
  const chain = (req.chain ?? "solana") as PayChain;
  const chainName = PAY_CHAIN_LABEL[chain] ?? "Solana";
  const evm = chain === "ethereum" || chain === "base";
  const displayAmount = evm ? req.exactAmountUsdc : String(req.amountUsdc);

  if (req.status === "paid") {
    return <Navigate to="/billing" />;
  }

  const watching = Boolean(req.signature) || req.status === "underpaid";

  async function copy(kind: "amount" | "address", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  if (watching && req.status !== "expired") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <Link to="/billing" className="text-sm text-muted hover:text-fg">
            ← Billing
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Watching {chainName}</h1>
          <p className="mt-1 text-sm text-muted">
            Waiting for {displayAmount} USDC to confirm. This usually takes a few seconds.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto size-16 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-lg font-semibold">Watching {chainName}</p>
            {req.status === "underpaid" && (
              <p className="text-sm text-warning">
                Received {req.paidAmountUsdc} USDC. Send the rest to reach {displayAmount} USDC.
              </p>
            )}
            <div className="border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Amount</span>
                <span>{displayAmount} USDC</span>
              </div>
              {req.signature && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-muted">Signature</span>
                  <span className="font-mono text-xs">{shortAddress(req.signature, 4)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-subtle">
          You will be notified here once the transaction is confirmed.
        </p>
      </div>
    );
  }

  if (req.status === "expired") {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Pay request expired</h1>
        <p className="text-sm text-muted">Start a new one from Billing. Links last 30 minutes.</p>
        <Button asChild>
          <Link to="/billing">Back to billing</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/billing" className="text-sm text-muted hover:text-fg">
          ← Billing
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {plan.name} · {displayAmount} USDC
        </h1>
        <p className="mt-1 text-sm text-muted">Complete your payment to activate your plan.</p>
      </div>
      <Card>
        <CardContent className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
          <PayQr
            value={req.payUrl}
            alt={evm ? `${chainName} USDC payment QR` : "Solana Pay QR"}
          />
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Amount</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium hover:text-primary"
                onClick={() => void copy("amount", displayAmount)}
              >
                {displayAmount} USDC
                <Copy className="size-3" />
                {copied === "amount" ? "copied" : null}
              </button>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted">Network</span>
              <span>{chainName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted">Token</span>
              <span>USDC</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">To</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary"
                onClick={() => void copy("address", req.recipient)}
              >
                {shortAddress(req.recipient, 4)}
                <Copy className="size-3" />
                {copied === "address" ? "copied" : null}
              </button>
            </div>
            {evm ? (
              <>
                <Button className="mt-4 w-full" asChild>
                  <a href={req.metamaskUrl ?? req.payUrl}>Open in MetaMask</a>
                </Button>
                <p className="text-center text-xs text-subtle">
                  USDC only. You pay network gas. Or scan the QR from MetaMask.
                </p>
              </>
            ) : (
              <>
                <Button className="mt-4 w-full" asChild>
                  <a href={req.payUrl}>Open in Phantom</a>
                </Button>
                <p className="text-center text-xs text-subtle">or scan the QR from Phantom</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {evm
          ? "Send the exact USDC amount. We match the Transfer amount on-chain. Do not send from an exchange."
          : "We match this payment with a unique reference. Do not send from an exchange."}
      </p>
    </div>
  );
}
