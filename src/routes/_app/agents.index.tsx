import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddAgentDialog } from "@/components/add-agent-dialog";
import { ChainBadge, SpendTone, StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAINS } from "@/lib/chains";
import { deleteAgent, getDashboard, updateAgent } from "@/lib/server/guard";
import { formatUsd, shortAddress } from "@/lib/utils";

export const Route = createFileRoute("/_app/agents/")({
  component: AgentsPage,
});

function AgentsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const del = useMutation({
    mutationFn: (id: string) => deleteAgent({ data: { id } }),
    onSuccess: () => {
      toast.success("Agent removed");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const pause = useMutation({
    mutationFn: (payload: { id: string; is_paused: boolean }) =>
      updateAgent({ data: payload }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (!q.data) return null;
  const d = q.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted">
            {d.liveCount ?? 0} live of {d.agentLimit} on {d.plan}
            {d.demoCount ? ` · ${d.demoCount} demo` : ""}
          </p>
        </div>
        {d.writable ? <AddAgentDialog /> : null}
      </div>
      {d.agents.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted">
            No agents yet. Add a wallet to start monitoring.
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3">
        {d.agents.map((a) => {
          const vol = d.volume[a.id] ?? 0;
          const limit = d.policies[a.id]?.daily_limit_usd ?? 1;
          const pct = (vol / limit) * 100;
          return (
            <Card key={a.id}>
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/agents/$id"
                      params={{ id: a.id }}
                      className="font-medium hover:text-primary"
                    >
                      {a.name}
                    </Link>
                    <ChainBadge chain={a.chain} />
                    <Badge>{a.is_demo ? "Demo" : "Live"}</Badge>
                    {a.is_paused ? <Badge>Paused</Badge> : <StatusBadge status={a.status} />}
                  </div>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    {shortAddress(a.address, 6)} · {a.role}
                  </p>
                  <div className="mt-3 max-w-sm">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{formatUsd(vol)} / {formatUsd(limit)}</span>
                      <span>{Math.round(pct)}%</span>
                    </div>
                    <Progress value={pct} tone={SpendTone(pct)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" asChild>
                    <a href={`${CHAINS[a.chain].explorer}${a.address}`} target="_blank" rel="noreferrer">
                      Explorer
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pause.mutate({ id: a.id, is_paused: !a.is_paused })}
                  >
                    {a.is_paused ? "Resume" : "Pause"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => del.mutate(a.id)}>
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
