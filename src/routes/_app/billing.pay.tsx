import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useEffect } from "react";
import { PayPanel } from "@/components/pay-panel";
import { ChainMark } from "@/components/chain-icons";
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

function NetworkLabel({ chain }: { chain: PayChain }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChainMark chain={chain} className="size-4" />
      {PAY_CHAIN_LABEL[chain]}
    </span>
  );
}

function PayRequestPage() {
  const { id } = Route.useSearch();
  const qc = useQueryClient();

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

  if (!id) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Pay link is missing</h1>
        <p className="text-sm text-muted">Go back to Billing and tap Pay again.</p>
        <Button asChild>
          <Link to="/billing">Back to billing</Link>
        </Button>
      </div>
    );
  }
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
  const evm = chain === "ethereum" || chain === "base";
  const displayAmount = evm ? req.exactAmountUsdc : String(req.amountUsdc);

  if (req.status === "paid") {
    return <Navigate to="/billing" />;
  }

  const watching = Boolean(req.signature) || req.status === "underpaid";

  if (watching && req.status !== "expired") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <Link to="/billing" className="text-sm text-muted hover:text-fg">
            ← Billing
          </Link>
          <h1 className="mt-3 inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Watching <NetworkLabel chain={chain} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            Waiting for {displayAmount} USDC to confirm. This usually takes a few seconds.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto size-16 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="inline-flex items-center justify-center gap-2 text-lg font-semibold">
              Watching <NetworkLabel chain={chain} />
            </p>
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

  if (!req.payUrl) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Payment QR is missing</h1>
        <p className="text-sm text-danger">This pay request has no QR payload. Go back and tap Pay again.</p>
        <Button asChild>
          <Link to="/billing">Back to billing</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link to="/billing" className="text-sm text-muted hover:text-fg">
          ← Billing
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Send {req.amountUsdc} USDC from {evm ? PAY_CHAIN_LABEL[chain] : "Phantom"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {evm
            ? "Open your wallet and send a normal USDC transfer to the address below. Copy amount and address, or scan the QR."
            : "Open Phantom and send a normal USDC transfer to the address below. Copy amount and address, or scan the QR."}
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <PayPanel req={req} />
        </CardContent>
      </Card>
      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Do not send from an exchange.
      </p>
    </div>
  );
}
