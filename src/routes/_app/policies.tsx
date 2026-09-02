import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, type PolicyRow } from "@/lib/server/guard";
import { formatUsd } from "@/lib/utils";

export const Route = createFileRoute("/_app/policies")({
  component: PoliciesPage,
});

function PoliciesPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (!q.data) return null;
  if (q.data.expired) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
          <p className="text-sm text-muted">Policy edits are locked until you pay in USDC.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              {q.data.agents.length} agent{q.data.agents.length === 1 ? "" : "s"} on file. Open billing to resume.
            </p>
            <Button asChild>
              <Link to="/billing">Open billing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
        <p className="text-sm text-muted">
          Spend caps, velocity, allowlists and denylists per agent.
        </p>
      </div>
      <div className="grid gap-3">
        {q.data.agents.map((a) => {
          const policies =
            "policies" in q.data ? (q.data.policies as Record<string, PolicyRow>) : {};
          const p = policies[a.id];
          return (
            <Card key={a.id}>
              <CardContent className="flex flex-col gap-2 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-sm text-muted">
                    Daily {formatUsd(p?.daily_limit_usd ?? 0)} · Max tx{" "}
                    {formatUsd(p?.max_tx_amount_usd ?? 0)} · {p?.max_hourly_txs ?? 20}/hr ·
                    Allow {p?.allowlist.length ?? 0} · Deny {p?.denylist.length ?? 0}
                  </p>
                </div>
                {q.data.writable ? (
                  <Link to="/agents/$id" params={{ id: a.id }} className="text-sm text-primary">
                    Edit policy
                  </Link>
                ) : (
                  <span className="text-sm text-muted">Locked</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
