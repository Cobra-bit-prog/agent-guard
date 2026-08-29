import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PLANS, type PlanId } from "@/lib/plans";

export type ExpiredProfile = {
  plan?: string;
  expired?: boolean;
  writable?: boolean;
  agentLimit?: number;
  agentCount?: number;
};

export function ExpiredPaywall({ profile }: { profile?: ExpiredProfile | null }) {
  const plan = (profile?.plan ?? "free") as PlanId;
  const trial = plan === "free";
  const name = PLANS[plan]?.name ?? "Free";
  return (
    <div className="mx-auto max-w-lg space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoring paused</h1>
        <p className="text-sm text-muted">
          {trial
            ? "Your 1-day free trial has ended. Scans and new agents stay paused until you pay in USDC."
            : `${name} ended. Pay again in USDC to resume monitoring.`}
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted">Plan</p>
              <p className="mt-1 font-medium">{trial ? "Free trial" : name}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Status</p>
              <p className="mt-1 font-medium text-primary">Ended</p>
            </div>
            <div>
              <p className="text-xs text-muted">Agent wallets</p>
              <p className="mt-1 font-medium tabular-nums">
                {typeof profile?.agentCount === "number" ? profile.agentCount : "—"}
                {typeof profile?.agentLimit === "number" ? ` / ${profile.agentLimit}` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Coverage</p>
              <p className="mt-1 font-medium">Paused</p>
            </div>
          </div>
          <p className="text-sm text-muted">
            Overview, agents, policies, and alerts are locked. Billing stays open.
          </p>
          <Button asChild className="w-full">
            <Link to="/billing">Open billing</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
