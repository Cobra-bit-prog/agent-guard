import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/lib/server/guard";
import { formatUsd } from "@/lib/utils";

export const Route = createFileRoute("/_app/policies")({
  component: PoliciesPage,
});

function PoliciesPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (!q.data) return null;

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
          const p = q.data.policies[a.id];
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
                <Link to="/agents/$id" params={{ id: a.id }} className="text-sm text-primary">
                  Edit policy
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
