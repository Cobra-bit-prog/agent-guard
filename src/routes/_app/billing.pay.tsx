import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useEffect } from "react";
import { PayPanel } from "@/components/pay-panel";
import { ChainMark } from "@/components/chain-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SolanaPayBlock } from "@/components/solana-pay-block";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { parseEmail, parsePaidPlan } from "@/lib/pay-invoice";
import { asPayAsset } from "@/lib/pay-asset";
import { getPayRequest, watchPayRequest } from "@/lib/server/solana-billing";
import { PAY_CHAIN_LABEL, type PayChain } from "@/lib/solana-pay";
import { shortAddress } from "@/lib/utils";

type PaySearch = { id?: string; plan?: string; email?: string };

export const Route = createFileRoute("/_app/billing/pay")({
  validateSearch: (search: Record<string, unknown>): PaySearch => {
    const id = typeof search.id === "string" ? search.id.trim() : "";
    const plan = parsePaidPlan(search.plan);
    const email = parseEmail(search.email);
    const out: PaySearch = {};
    if (id) out.id = id;
    if (search.plan) out.plan = plan;
    if (email) out.email = email;
    // search.recipient is ignored — query strings cannot retarget funds.
    return out;
  },
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
  const { id, plan, email } = Route.useSearch();
  const { user } = useCurrentUserState();
  const native = useQuery({
    queryKey: ["pay-request", id],
    queryFn: () => getPayRequest({ data: { id: id as string } }),
    enabled: Boolean(id && user),
  });
  const asset = native.data ? asPayAsset(native.data.asset) : "usdc";

  if (id && user && native.isLoading) {
    return <Skeleton className="h-80" />;
  }
  if (id && native.data && asset !== "usdc") {
    return <NativePayRequest id={id} />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link to="/" className="text-body text-muted hover:text-fg">
        ← Home
      </Link>
      <SolanaPayBlock plan={plan ?? "starter"} id={id} email={email} />
    </div>
  );
}

/** SOL / ETH under Other — logged-in PayPanel, not the $29 USDC invoice. */
function NativePayRequest({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["pay-request", id],
    queryFn: () => getPayRequest({ data: { id } }),
  });
  const watch = useMutation({
    mutationFn: () => watchPayRequest({ data: { id } }),
    onSuccess: (row) => {
      void qc.setQueryData(["pay-request", id], row);
      if (row.status === "paid") void qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  useEffect(() => {
    const row = q.data;
    if (!row || row.status === "paid" || row.status === "expired") return;
    const t = setInterval(() => {
      watch.mutate();
    }, 4000);
    watch.mutate();
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, q.data?.status]);

  if (q.isLoading) return <Skeleton className="h-80" />;
  if (q.isError) {
    return (
      <p className="text-body text-danger">
        {(q.error as Error).message}{" "}
        <Link to="/billing" className="underline">
          Back to billing
        </Link>
      </p>
    );
  }
  const req = q.data!;
  const chain = (req.chain ?? "solana") as PayChain;
  const asset = asPayAsset(req.asset);
  const symbol = req.symbol ?? "USDC";
  const displayAmount = req.exactAmount ?? req.exactAmountUsdc ?? String(req.amountUsdc);

  if (req.status === "paid") {
    return <Navigate to="/billing" />;
  }

  const waiting = Boolean(req.signature) || req.status === "underpaid";

  if (waiting && req.status !== "expired") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <Link to="/billing" className="text-body text-muted hover:text-fg">
            ← Billing
          </Link>
          <h1 className="mt-3 inline-flex items-center gap-2 text-title font-semibold tracking-tight">
            Waiting for confirmation · <NetworkLabel chain={chain} />
          </h1>
          <p className="mt-1 text-body text-muted">
            Waiting for {displayAmount} {symbol} to confirm. This usually takes a few seconds.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <div className="mx-auto size-16 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="inline-flex items-center justify-center gap-2 text-card font-semibold">
              Waiting · <NetworkLabel chain={chain} />
            </p>
            {req.status === "underpaid" && (
              <p className="text-body text-warning">
                Received a partial payment. Send the rest to reach {displayAmount} {symbol}.
              </p>
            )}
            <div className="border-t border-border pt-4 text-body">
              <div className="flex justify-between">
                <span className="text-muted">Amount</span>
                <span>
                  {displayAmount} {symbol}
                </span>
              </div>
              {req.signature && (
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-muted">Signature</span>
                  <span className="font-mono text-meta">{shortAddress(req.signature, 4)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (req.status === "expired") {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-title font-semibold">Pay request expired</h1>
        <p className="text-body text-muted">Start a new one from Billing. Links last 30 minutes.</p>
        <Button asChild>
          <Link to="/billing">Back to billing</Link>
        </Button>
      </div>
    );
  }

  if (!req.payUrl) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-title font-semibold">Payment QR is missing</h1>
        <p className="text-body text-danger">
          This pay request has no QR payload. Go back and tap Pay again.
        </p>
        <Button asChild>
          <Link to="/billing">Back to billing</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link to="/billing" className="text-body text-muted hover:text-fg">
          ← Billing
        </Link>
        <h1 className="mt-3 text-title font-semibold tracking-tight">
          Send {displayAmount} {symbol}
        </h1>
        <p className="mt-1 text-body text-muted">
          {asset === "sol"
            ? "Send SOL from your wallet. Copy the exact amount and address, or scan the QR. The rate is locked on this invoice."
            : "Send ETH from your wallet. Copy the exact amount and address, or scan the QR. The rate is locked on this invoice."}
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <PayPanel req={req} />
        </CardContent>
      </Card>
      <p className="flex items-start gap-2 text-meta text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Use a wallet. Do not send from Coinbase or Binance.
      </p>
    </div>
  );
}
