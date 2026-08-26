import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { changePlan, getProfile } from "@/lib/server/guard";
import { FREE_TRIAL_DAYS, PLANS, formatTrialLeft, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

function BillingPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const mut = useMutation({
    mutationFn: (plan: PlanId) => changePlan({ data: { plan } }),
    onSuccess: (r) => {
      toast.success(`Switched to ${r.name}`);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  const current = (q.data?.plan ?? "free") as PlanId;
  const expired = Boolean(q.data?.expired);
  const trialing = q.data?.planStatus === "trialing";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted">
          {current === "free" && !expired && trialing
            ? `Free 1-day trial — ${formatTrialLeft(q.data?.msLeft ?? 0)}.`
            : expired
              ? "Trial ended. Choose a plan to resume monitoring."
              : `Current plan: ${PLANS[current]?.name ?? current}`}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.values(PLANS).map((p) => {
          const isFree = p.id === "free";
          const isCurrent = p.id === current && !expired;
          return (
            <Card
              key={p.id}
              className={cn(isCurrent && "ring-1 ring-primary/50")}
            >
              <CardContent className="flex h-full flex-col p-5">
                <p className="text-sm text-muted">{p.name}</p>
                <p className="mt-2 text-3xl font-semibold">
                  {p.price === 0 ? "Free" : `$${p.price}`}
                  {p.price > 0 && <span className="text-sm font-normal text-muted">/mo</span>}
                </p>
                {isFree && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {FREE_TRIAL_DAYS}-day maximum
                  </p>
                )}
                <p className="mt-2 flex-1 text-sm text-muted">{p.blurb}</p>
                <ul className="mt-4 space-y-2 text-sm text-muted">
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" />
                    {p.agents} agents
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" />
                    {p.historyDays}-day history
                  </li>
                </ul>
                <Button
                  className="mt-6"
                  variant={isCurrent ? "secondary" : "default"}
                  disabled={isFree || isCurrent || mut.isPending}
                  onClick={() => mut.mutate(p.id)}
                >
                  {isFree
                    ? expired
                      ? "Trial used"
                      : "Current trial"
                    : isCurrent
                      ? "Current plan"
                      : "Upgrade"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-subtle">
        Free is a one-time {FREE_TRIAL_DAYS}-day trial. After it ends, scans and new
        agents pause until you upgrade. Paid plans are monthly.
      </p>
      <p className="text-xs text-warning">
        Card checkout is not live yet. Upgrade enables the plan in this workspace
        only — Stripe is connected (Zenith Market AI, live mode) but it currently
        bills a different product. No Agent Guard charges go through.
      </p>
    </div>
  );
}
