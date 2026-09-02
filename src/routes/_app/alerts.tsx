import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { acknowledgeAlert, getDashboard, updateAgent } from "@/lib/server/guard";
import { timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/_app/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const ack = useMutation({
    mutationFn: (id: string) => acknowledgeAlert({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const pause = useMutation({
    mutationFn: (id: string) => updateAgent({ data: { id, is_paused: true } }),
    onSuccess: () => {
      toast.success("Agent paused");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (!q.data) return null;
  const writable = q.data.writable !== false;
  if (q.data.expired) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted">Live alerts are paused until you pay in USDC.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">Acknowledge and pause stay locked on an ended trial.</p>
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
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted">
          Policy alerts, near-limit spend, holds, and blocked checks.
        </p>
      </div>
      {q.data.alerts.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted">
            No alerts yet. Scan the fleet to generate a live pass.
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {q.data.alerts.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.severity === "critical" ? "critical" : "warning"}>
                    {a.severity}
                  </Badge>
                  {a.acknowledged && <Badge>Acknowledged</Badge>}
                </div>
                <p className="mt-2 text-sm">{a.message}</p>
                <p className="text-xs text-subtle">
                  {a.agent_name} · {timeAgo(a.created_at)}
                </p>
              </div>
              {!a.acknowledged && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!writable}
                    onClick={() => ack.mutate(a.id)}
                  >
                    Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!writable}
                    onClick={() => pause.mutate(a.agent_id)}
                  >
                    Pause
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
