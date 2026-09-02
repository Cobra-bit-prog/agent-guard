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
import { CHAINS, chainRank } from "@/lib/chains";
import { acknowledgeAlert, getDashboard, scanAgents, updateAgent } from "@/lib/server/guard";
import { cn, formatUsd, shortAddress, timeAgo } from "@/lib/utils";

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
      <div className="space-y-6">
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[16px]" />
          ))}
        </div>
        <Skeleton className="h-28 rounded-[16px]" />
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
          <Skeleton className="h-72 rounded-[16px]" />
          <Skeleton className="h-72 rounded-[16px]" />
        </div>
      </div>
    );
  }
  if (q.error || !q.data) {
    return <p className="text-sm text-danger">Could not load the console.</p>;
  }

  const d = q.data;
  if (d.expired) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted">Monitoring is paused until you pay in USDC.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted">Agent wallets</p>
                <p className="mt-1 font-medium tabular-nums">{d.agents.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Coverage</p>
                <p className="mt-1 font-medium text-primary">Paused</p>
              </div>
            </div>
            <Button asChild>
              <Link to="/billing">Open billing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  const open = d.alerts.filter((a) => !a.acknowledged);
  const agents = [...d.agents].sort(
    (a, b) => chainRank(a.chain) - chainRank(b.chain) || a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted">Live wallets, policy, and pre-sign checks.</p>
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
          value={formatUsd(d.volume24h ?? 0)}
          hint={d.volumeHint ?? "Transfer volume — not treasury size"}
        />
        <Stat
          label="On-chain balance"
          value={formatUsd(d.onchainUsd ?? 0)}
          hint={d.onchainHint ?? "Native balance of live wallets"}
        />
        <Stat
          label="Open alerts"
          value={String(d.openAlerts)}
          hint={d.openAlerts ? "Needs attention" : "All clear"}
          tone={d.openAlerts ? "danger" : "success"}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs text-muted">Protection score</p>
            <p className="dashboard-stat-in mt-1 text-4xl font-semibold tabular-nums tracking-tight">
              {d.protection.score}
              <span className="ml-2 text-sm font-normal text-muted">{d.protection.label}</span>
            </p>
          </div>
          <div className="dashboard-score-bar w-full max-w-sm">
            <Progress
              value={d.protection.score}
              tone={
                d.protection.score >= 80
                  ? "success"
                  : d.protection.score >= 55
                    ? "warning"
                    : "danger"
              }
            />
          </div>
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
                {agents.map((a, i) => {
                  const last = d.txs.find((t) => t.agent_id === a.id);
                  const limit = d.policies[a.id]?.daily_limit_usd ?? 1;
                  const vol = d.volume[a.id] ?? 0;
                  const pct = (vol / limit) * 100;
                  return (
                    <tr
                      key={a.id}
                      className="dashboard-row-in border-t border-border"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <td className="py-3">
                        <Link to="/agents/$id" params={{ id: a.id }} className="block hover:text-primary">
                          <p className="font-medium">{a.name}</p>
                          <p className="mt-0.5 flex items-center gap-2 font-mono text-xs text-subtle">
                            <ChainMark chain={a.chain} className="size-5" />
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
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              Live
            </span>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.txs.slice(0, 8).map((t, i) => {
              const agent = d.agents.find((a) => a.id === t.agent_id);
              const failed = t.status === "failed" || t.is_violation;
              const presign = t.source === "presign";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "dashboard-row-in flex items-start gap-3",
                    failed && "dashboard-block-row",
                  )}
                  style={{ animationDelay: `${80 + i * 50}ms` }}
                >
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
                        : presign
                          ? " · pre-sign"
                          : " · demo"}
                      {failed ? " · blocked" : ""}
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
            <Chart
              data={d.spendSeries}
              color="#3b82f6"
              unit="usd"
              empty={d.demoCount && !(d.volume24h ?? 0) ? "Demo · no spend yet" : "No spend in the last 24h"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Transaction velocity</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <Chart
              data={d.velocity}
              color="#10b981"
              unit="count"
              empty={d.demoCount && !(d.volume24h ?? 0) ? "Demo · no transactions yet" : "No transactions in the last 24h"}
            />
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
              className="dashboard-block-row flex flex-col gap-3 p-4 md:flex-row md:items-center"
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
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!d.writable}
                  onClick={() => ack.mutate(a.id)}
                >
                  Acknowledge
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!d.writable}
                  onClick={() => pause.mutate(a.agent_id)}
                >
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
          key={value}
          className={
            tone === "danger"
              ? "dashboard-stat-in mt-1 text-2xl font-semibold tabular-nums text-danger"
              : tone === "warning"
                ? "dashboard-stat-in mt-1 text-2xl font-semibold tabular-nums text-warning"
                : tone === "success"
                  ? "dashboard-stat-in mt-1 text-2xl font-semibold tabular-nums text-success"
                  : "dashboard-stat-in mt-1 text-2xl font-semibold tabular-nums"
          }
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-subtle">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Chart({
  data,
  color,
  empty,
  unit,
}: {
  data: { t: string; v: number }[] | undefined;
  color: string;
  empty: string;
  unit: "usd" | "count";
}) {
  const series = Array.isArray(data) ? data : [];
  const allZero = series.length === 0 || series.every((pt) => !Number(pt.v));
  if (allZero) {
    return (
      <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-1 text-center">
        <p className="text-2xl font-semibold tabular-nums">{unit === "usd" ? "$0" : "0"}</p>
        <p className="text-sm text-muted">{empty}</p>
      </div>
    );
  }
  const gid = `dash-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis hide domain={[0, "auto"]} />
        <Tooltip
          contentStyle={{
            background: "#161c27",
            border: "1px solid #1e2633",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          fill={`url(#${gid})`}
          fillOpacity={1}
          isAnimationActive
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
