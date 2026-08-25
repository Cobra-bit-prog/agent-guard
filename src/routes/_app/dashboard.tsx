import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { ChainMark } from "@/components/chain-icons";
import { SpendTone, StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAINS } from "@/lib/chains";
import { acknowledgeAlert, getDashboard, scanAgents, updateAgent } from "@/lib/server/guard";
import { formatUsd, shortAddress, timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(),
    refetchInterval: 20_000,
  });
  const scan = useMutation({
    mutationFn: () => scanAgents(),
    onSuccess: (r) => {
      toast.success(
        r.onchain
          ? `Synced ${r.onchain} on-chain transfer${r.onchain === 1 ? "" : "s"}`
          : `Recorded ${r.created} demo event${r.created === 1 ? "" : "s"}`,
      );
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
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

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return <p className="text-sm text-danger">Could not load the console.</p>;
  }

  const d = q.data;
  const open = d.alerts.filter((a) => !a.acknowledged);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted">
            Real-time security monitoring for your AI agents.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => scan.mutate()}
          disabled={scan.isPending || !d.writable}
        >
          <RefreshCw className={scan.isPending ? "animate-spin" : ""} />
          Scan chain
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Agent wallets"
          value={String(d.agents.length)}
          hint={`${d.liveCount ?? 0} live · ${d.demoCount ?? 0} demo`}
        />
        <Stat
          label="Moved in last 24h"
          value={formatUsd(d.volume24h ?? d.capital)}
          hint="Transfer volume — not treasury size"
        />
        <Stat
          label="On-chain balance"
          value={formatUsd(d.onchainUsd ?? 0)}
          hint="Native balance of live wallets"
        />
        <Stat label="Open alerts" value={String(d.openAlerts)} hint="Needs attention" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Protection score</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {d.protection.score}
                <span className="text-sm font-normal text-muted"> / 100 · {d.protection.label}</span>
              </p>
            </div>
            <p className="max-w-md text-xs text-subtle">
              Score from allowlists, spend caps, open incidents, and plan status.
              This is readiness — not an insurance policy.
            </p>
          </div>
          <Progress
            value={d.protection.score}
            tone={
              d.protection.score >= 80 ? "success" : d.protection.score >= 55 ? "warning" : "danger"
            }
          />
          <ul className="grid gap-1 text-sm text-muted md:grid-cols-2">
            {d.protection.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Agent wallets</CardTitle>
            <Link to="/agents" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-subtle">
                <tr>
                  <th className="pb-3 font-medium">Agent</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">24h volume</th>
                  <th className="pb-3 font-medium">Spend vs limit</th>
                  <th className="pb-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {d.agents.map((a) => {
                  const last = d.txs.find((t) => t.agent_id === a.id);
                  const limit = d.policies[a.id]?.daily_limit_usd ?? 1;
                  const vol = d.volume[a.id] ?? 0;
                  const pct = (vol / limit) * 100;
                  return (
                    <tr key={a.id} className="border-t border-border">
                      <td className="py-3">
                        <Link to="/agents/$id" params={{ id: a.id }} className="block hover:text-primary">
                          <p className="font-medium">{a.name}</p>
                          <p className="flex items-center gap-1.5 font-mono text-xs text-subtle">
                            <ChainMark chain={a.chain} className="size-3.5" />
                            {CHAINS[a.chain].name}
                            {a.is_demo ? " · demo" : " · live"} · {shortAddress(a.address)}
                          </p>
                        </Link>
                      </td>
                      <td>
                        {a.is_paused ? <Badge>Paused</Badge> : <StatusBadge status={a.status} />}
                      </td>
                      <td className="font-mono tabular-nums">{formatUsd(vol)}</td>
                      <td className="w-40">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} tone={SpendTone(pct)} />
                          <span className="w-10 text-right font-mono text-xs text-muted">
                            {Math.round(pct)}%
                          </span>
                        </div>
                      </td>
                      <td className="text-muted">{last ? timeAgo(last.timestamp) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Live activity</CardTitle>
            <span className="flex items-center gap-1.5 text-xs text-success">
              <span className="size-1.5 rounded-full bg-success" />
              Live
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.txs.slice(0, 8).map((t) => {
              const agent = d.agents.find((a) => a.id === t.agent_id);
              const failed = t.status === "failed" || t.is_violation;
              return (
                <div key={t.id} className="flex items-start gap-3">
                  <span
                    className={
                      failed
                        ? "mt-1 size-2 shrink-0 rounded-full bg-danger"
                        : t.kind.toLowerCase().includes("limit")
                          ? "mt-1 size-2 shrink-0 rounded-full bg-warning"
                          : "mt-1 size-2 shrink-0 rounded-full bg-success"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.kind}</p>
                    <p className="truncate text-xs text-subtle">
                      {agent?.name} · {formatUsd(t.value_usd)}
                      {t.source === "onchain"
                        ? " · on-chain"
                        : t.source === "presign"
                          ? " · pre-sign"
                          : " · demo"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-subtle">{timeAgo(t.timestamp)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spend over 24h</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <Chart data={d.spendSeries} color="#3b82f6" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Transaction velocity</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <Chart data={d.velocity} color="#10b981" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {open.length === 0 && (
            <p className="text-sm text-muted">No open alerts. Fleet is quiet.</p>
          )}
          {open.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-elevated p-4 md:flex-row md:items-center"
            >
              <AlertTriangle
                className={
                  a.severity === "critical" ? "size-4 text-danger" : "size-4 text-warning"
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.message}</p>
                <p className="text-xs text-subtle">
                  {a.agent_name} · {timeAgo(a.created_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => ack.mutate(a.id)}>
                  Acknowledge
                </Button>
                <Button size="sm" variant="outline" onClick={() => pause.mutate(a.agent_id)}>
                  Pause agent
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.audit.length === 0 && (
            <p className="text-sm text-muted">No control-plane events yet.</p>
          )}
          {d.audit.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-wide text-subtle">
                  {e.action.replaceAll("_", " ")}
                </p>
                <p className="text-muted">{e.detail}</p>
              </div>
              <span className="shrink-0 text-xs text-subtle">{timeAgo(e.created_at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={
            tone === "danger"
              ? "mt-1 text-2xl font-semibold tabular-nums text-danger"
              : tone === "warning"
                ? "mt-1 text-2xl font-semibold tabular-nums text-warning"
                : "mt-1 text-2xl font-semibold tabular-nums"
          }
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-subtle">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Chart({ data, color }: { data: { t: string; v: number }[]; color: string }) {
  if (!data.length) {
    return <p className="grid h-full place-items-center text-sm text-muted">No activity yet</p>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <XAxis dataKey="t" hide />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            background: "#161c27",
            border: "1px solid #1e2633",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.18} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
