import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getProfile } from "@/lib/server/guard";
import { createPayRequest, getCheckoutConfig } from "@/lib/server/solana-billing";
import { FREE_TRIAL_DAYS, PLANS, formatTrialLeft, type PlanId } from "@/lib/plans";
import { PAY_ASSET_LABEL, type PayAsset } from "@/lib/pay-asset";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/billing/")({
  component: BillingPage,
});

const PAID = [PLANS.starter, PLANS.pro, PLANS.team] as const;
const ASSETS: PayAsset[] = ["usdc", "sol", "eth"];
function assetHint(asset: PayAsset) {
  if (asset === "usdc") return "Solana · USDC · no card";
  if (asset === "sol") return "Solana · SOL · rate locks on Pay";
  return "Ethereum · ETH · rate locks on Pay";
}

function BillingPage() {
  const [asset, setAsset] = useState<PayAsset>("usdc");
  const q = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const cfg = useQuery({ queryKey: ["checkout-config"], queryFn: () => getCheckoutConfig() });
  const pay = useMutation({
    mutationFn: (plan: "starter" | "pro" | "team") => createPayRequest({ data: { plan, asset } }),
    onSuccess: (req) => {
      if (!req?.id) {
        toast.error("Could not start payment. Try Pay again.");
        return;
      }
      window.location.assign(`/billing/pay?id=${encodeURIComponent(req.id)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  const current = (q.data?.plan ?? "free") as PlanId;
  const expired = Boolean(q.data?.expired);
  const trialing = q.data?.planStatus === "trialing";
  const paidActive = current !== "free" && !expired;
  const checkoutOff = cfg.isSuccess && !cfg.data?.[asset];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        {current === "free" && !expired && trialing ? (
          <p className="text-sm text-muted">
            Free 1-day trial — {formatTrialLeft(q.data?.msLeft ?? 0)}.
          </p>
        ) : null}
      </div>

      {expired && (
        <div className="flex items-start gap-3 rounded-[16px] border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="mt-0.5 grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-bg">
            !
          </span>
          <div>
            <p className="font-medium text-primary">
              {current === "free" ? "1-day trial ended" : `${PLANS[current].name} ended`}
            </p>
            <p className="text-sm text-muted">Choose a plan to continue securing your agents.</p>
          </div>
        </div>
      )}

      {paidActive && (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-4 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-success/20 text-2xl text-success">
              ✓
            </span>
            <p className="mt-4 text-xl font-semibold">{PLANS[current].name} is active</p>
            <p className="mt-1 text-sm text-success">USDC received on-chain</p>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-subtle">Current plan</p>
            <Card>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-lg font-semibold">{PLANS[current].name}</p>
                  <p className="mt-1 text-sm text-muted">{PLANS[current].agents} agent wallets</p>
                  <p className="text-sm text-muted">
                    {q.data?.msLeft
                      ? `Renews in ${Math.max(1, Math.ceil(q.data.msLeft / 86400000))} days`
                      : "Renews in 30 days"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">${PLANS[current].price}/mo</p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                    <span className="size-1.5 rounded-full bg-success" />
                    Paid
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm text-muted">Pay with</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ASSETS.map((a) => (
            <button
              key={a}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm",
                asset === a
                  ? "border-primary bg-primary/10 text-fg"
                  : "border-border text-muted hover:text-fg",
              )}
              onClick={() => setAsset(a)}
            >
              {PAY_ASSET_LABEL[a]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-subtle">{assetHint(asset)}</p>
      </div>

      {cfg.isError ? (
        <p className="rounded-[16px] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Could not check checkout. Tap Pay anyway — you will see an error if it is not set up.
        </p>
      ) : null}

      {checkoutOff && (
        <p className="rounded-[16px] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {PAY_ASSET_LABEL[asset]} checkout is not configured. Pick another token or ask an operator
          to set{" "}
          <code className="text-xs">
            {asset === "eth" ? "EVM_PAYOUT_ADDRESS" : "SOLANA_PAYOUT_ADDRESS"}
          </code>
          .
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {PAID.map((p, i) => {
          const isCurrent = p.id === current && !expired;
          const highlighted = i === 0 && !paidActive;
          return (
            <Card key={p.id} className={cn((highlighted || isCurrent) && "ring-1 ring-primary/50")}>
              <CardContent className="flex h-full flex-col p-5">
                <p className="text-lg font-semibold">{p.name}</p>
                <p className="mt-1 text-sm text-muted">{p.blurb}</p>
                <p className="mt-3 text-3xl font-semibold">
                  ${p.price}
                  <span className="text-sm font-normal text-muted"> /mo</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
                  <li className="flex gap-2">
                    <Check className="size-4 text-primary" />
                    {p.agents} agents
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-primary" />
                    {p.historyDays}-day history
                  </li>
                </ul>
                <Button
                  className="mt-6"
                  variant={highlighted || isCurrent ? "default" : "secondary"}
                  disabled={pay.isPending || isCurrent || checkoutOff}
                  onClick={() => pay.mutate(p.id)}
                >
                  {isCurrent
                    ? "Current plan"
                    : pay.isPending
                      ? "Starting…"
                      : `Pay ${p.price} in ${PAY_ASSET_LABEL[asset]}`}
                </Button>
                <p className="mt-2 text-center text-xs text-subtle">{assetHint(asset)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="flex items-center justify-center gap-2 text-xs text-subtle">
        <Lock className="size-3" />
        All payments are made on-chain. We never see your funds.
      </p>
      {paidActive && (
        <p className="text-center text-xs text-subtle">
          Next month we will show a new pay request here.
        </p>
      )}
      <p className="text-center text-xs">
        <Link to="/" hash="faq" className="text-primary underline-offset-4 hover:underline">
          Learn more about billing
        </Link>
        <span className="text-subtle"> · </span>
        <a
          href="mailto:support@agent-control.net"
          className="text-primary underline-offset-4 hover:underline"
        >
          Need help? Contact
        </a>
      </p>
      <p className="text-xs text-subtle">
        Free is a one-time {FREE_TRIAL_DAYS}-day trial. After it ends, scans and new agents pause
        until you pay in USDC, SOL, or ETH. No silent autopay.
      </p>
    </div>
  );
}
