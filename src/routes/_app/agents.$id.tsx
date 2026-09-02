import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChainBadge, StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAINS } from "@/lib/chains";
import {
  getDashboard,
  getOnchain,
  rotateApiKey,
  savePolicy,
  simulateTransfer,
  type PolicyRow,
} from "@/lib/server/guard";
import { formatUsd, shortAddress, timeAgo } from "@/lib/utils";
import { useState } from "react";

export const Route = createFileRoute("/_app/agents/$id")({
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const chain = useQuery({
    queryKey: ["onchain", id],
    queryFn: () => getOnchain({ data: { id } }),
  });
  const agent = q.data?.agents.find((a) => a.id === id);
  const policies =
    q.data && "policies" in q.data
      ? (q.data.policies as Record<string, PolicyRow>)
      : {};
  const policy = policies[id];
  const txs = q.data?.txs.filter((t) => t.agent_id === id) ?? [];
  const writable = q.data?.writable !== false;

  const [daily, setDaily] = useState<string>();
  const [maxTx, setMaxTx] = useState<string>();
  const [threshold, setThreshold] = useState<string>();
  const [allow, setAllow] = useState<string>();
  const [deny, setDeny] = useState<string>();
  const [hourly, setHourly] = useState<string>();
  const [simTo, setSimTo] = useState("");
  const [simAmt, setSimAmt] = useState("500");

  const save = useMutation({
    mutationFn: () =>
      savePolicy({
        data: {
          agent_id: id,
          daily_limit_usd: Number(daily ?? policy?.daily_limit_usd),
          max_tx_amount_usd: Number(maxTx ?? policy?.max_tx_amount_usd),
          alert_threshold_usd: Number(threshold ?? policy?.alert_threshold_usd),
          allowlist: (allow ?? policy?.allowlist.join("\n") ?? "")
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
          denylist: (deny ?? policy?.denylist.join("\n") ?? "")
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
          max_hourly_txs: Number(hourly ?? policy?.max_hourly_txs ?? 20),
        },
      }),
    onSuccess: () => {
      toast.success("Policy updated");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sim = useMutation({
    mutationFn: () =>
      simulateTransfer({
        data: { agent_id: id, to: simTo, value_usd: Number(simAmt) },
      }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.data?.expired) {
    return (
      <div className="space-y-6">
        <div>
          <Link to="/agents" className="text-xs text-muted hover:text-fg">
            Agents
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{agent?.name ?? "Agent"}</h1>
          <p className="text-sm text-muted">This agent is locked until you pay in USDC.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">Policy edits, scan, and API key rotate are paused.</p>
            <Button asChild>
              <Link to="/billing">Open billing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!agent) {
    return (
      <p className="text-sm text-muted">
        Agent not found. <Link to="/agents">Back</Link>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/agents" className="text-xs text-muted hover:text-fg">
          Agents
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
          <ChainBadge chain={agent.chain} />
          <Badge>{agent.is_demo ? "Demo" : "Live"}</Badge>
          <StatusBadge status={agent.status} />
        </div>
        <p className="mt-1 font-mono text-xs text-subtle">{agent.address}</p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/audit" search={{ agent: agent.id }}>
              Generate audit report
            </Link>
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted">
          On-chain {CHAINS[agent.chain].native}:{" "}
          {chain.data?.ok ? (
            <>
              <span className="font-mono tabular-nums text-fg">{chain.data.native}</span>
              {" · "}
              {formatUsd(chain.data.usd)}
              {chain.data.demo ? " · demo sample" : ""}
            </>
          ) : (
            <span>not available for this address</span>
          )}
        </p>
      </div>

      <PreSignCard
        agentId={agent.id}
        apiKey={agent.api_key}
        demo={agent.is_demo}
        writable={writable}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Daily spend limit (USD)</Label>
                <Input
                  type="number"
                  defaultValue={policy?.daily_limit_usd}
                  onChange={(e) => setDaily(e.target.value)}
                  disabled={!writable}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max single transaction (USD)</Label>
                <Input
                  type="number"
                  defaultValue={policy?.max_tx_amount_usd}
                  onChange={(e) => setMaxTx(e.target.value)}
                  disabled={!writable}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Alert threshold (USD)</Label>
                <Input
                  type="number"
                  defaultValue={policy?.alert_threshold_usd}
                  onChange={(e) => setThreshold(e.target.value)}
                  disabled={!writable}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max transactions / hour</Label>
                <Input
                  type="number"
                  defaultValue={policy?.max_hourly_txs ?? 20}
                  onChange={(e) => setHourly(e.target.value)}
                  disabled={!writable}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Allowlist (one address per line)</Label>
                <textarea
                  className="min-h-24 w-full rounded-[var(--radius-sm)] border border-border bg-bg p-3 font-mono text-xs"
                  defaultValue={policy?.allowlist.join("\n")}
                  onChange={(e) => setAllow(e.target.value)}
                  disabled={!writable}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Denylist</Label>
                <textarea
                  className="min-h-20 w-full rounded-[var(--radius-sm)] border border-border bg-bg p-3 font-mono text-xs"
                  defaultValue={policy?.denylist.join("\n")}
                  onChange={(e) => setDeny(e.target.value)}
                  disabled={!writable}
                />
              </div>
              <Button disabled={save.isPending || !writable}>Save policy</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Simulate a transfer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted">
                Dry-run against this agent’s live policy. Nothing is signed or sent.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="sim-to">Destination</Label>
                <Input
                  id="sim-to"
                  value={simTo}
                  onChange={(e) => setSimTo(e.target.value)}
                  placeholder={policy?.allowlist[0] ?? "0x… or Solana address"}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount (USD)</Label>
                <Input type="number" value={simAmt} onChange={(e) => setSimAmt(e.target.value)} />
              </div>
              <Button
                variant="secondary"
                disabled={sim.isPending || !writable || !simTo || !Number(simAmt)}
                onClick={() => sim.mutate()}
              >
                Run policy check
              </Button>
              {sim.data && (
                <div className="rounded-[var(--radius-lg)] bg-elevated p-4">
                  <Badge
                    className={
                      sim.data.action === "block"
                        ? "bg-danger/15 text-danger"
                        : sim.data.action === "hold"
                          ? "bg-warning/15 text-warning"
                          : sim.data.action === "alert"
                            ? "bg-warning/15 text-warning"
                            : "bg-success/15 text-success"
                    }
                  >
                    {sim.data.action}
                  </Badge>
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {sim.data.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-subtle">
                    Spent today {formatUsd(sim.data.usedTodayUsd)} of{" "}
                    {formatUsd(sim.data.daily_limit_usd)} · {sim.data.txsLastHour} txs this hour
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {txs.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
              {txs.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p>{t.kind}</p>
                    <p className="truncate font-mono text-xs text-subtle">
                      {shortAddress(t.tx_hash, 6)}
                      {t.source ? ` · ${t.source}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono tabular-nums">{formatUsd(t.value_usd)}</p>
                    <p className="text-xs text-subtle">{timeAgo(t.timestamp)}</p>
                  </div>
                </div>
              ))}
              <Button variant="secondary" size="sm" asChild>
                <a
                  href={`${CHAINS[agent.chain].explorer}${agent.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open explorer
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PreSignCard({
  agentId,
  apiKey,
  demo,
  writable,
}: {
  agentId: string;
  apiKey: string;
  demo: boolean;
  writable: boolean;
}) {
  const qc = useQueryClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rotate = useMutation({
    mutationFn: () => rotateApiKey({ data: { id: agentId } }),
    onSuccess: () => {
      toast.success("API key rotated");
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const curl = `curl -s ${origin}/api/v1/check \\
  -H "Authorization: Bearer ${apiKey || "<key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"DESTINATION","value_usd":250}'`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-sign hook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted">
          {demo
            ? "This is a demo wallet. The same hook works — wire it on a live agent before production sends."
            : "Your agent MUST call this before it signs. If must_abort is true, do not send."}
        </p>
        <div className="space-y-1.5">
          <Label>API key</Label>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={apiKey} className="font-mono text-xs" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(apiKey);
                toast.success("Key copied");
              }}
            >
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!writable || rotate.isPending}
              onClick={() => rotate.mutate()}
            >
              Rotate
            </Button>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-bg p-3 font-mono text-[11px] text-muted">
          {curl}
        </pre>
        <p className="text-xs text-subtle">
          MCP: POST {origin}/api/v1/mcp · tools/call check_transfer with the same Bearer key.
        </p>
      </CardContent>
    </Card>
  );
}
