import { ChainMark } from "@/components/chain-icons";
import { ChainBadge, StatusBadge } from "@/components/status";
import { Progress } from "@/components/ui/progress";

const AGENTS = [
  {
    name: "Trade Agent Alpha",
    chain: "base" as const,
    tag: "Demo",
    status: "healthy" as const,
    vol: "$4,210",
    pct: 14,
    last: "12s",
  },
  {
    name: "Treasury Bot",
    chain: "ethereum" as const,
    tag: "Live",
    status: "warning" as const,
    vol: "$8,140",
    pct: 68,
    last: "1m",
  },
  {
    name: "Solana Router",
    chain: "solana" as const,
    tag: "Live",
    status: "healthy" as const,
    vol: "$1,080",
    pct: 13,
    last: "4m",
  },
];

const FEED = [
  { t: "12s", agent: "Trade Agent Alpha", ev: "Swap", amt: "$640", tone: "ok" as const },
  { t: "1m", agent: "Treasury Bot", ev: "Policy block", amt: "$2,400", tone: "bad" as const },
  { t: "4m", agent: "Solana Router", ev: "Transfer", amt: "$180", tone: "ok" as const },
  { t: "9m", agent: "Treasury Bot", ev: "Pre-sign allow", amt: "$420", tone: "ok" as const },
  { t: "18m", agent: "Trade Agent Alpha", ev: "Oracle update", amt: "$0", tone: "ok" as const },
];

export function LandingConsole() {
  return (
    <div className="mt-14 overflow-hidden rounded-[28px] border border-border bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex items-center gap-2 border-b border-border bg-elevated/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-danger/80" />
        <span className="size-2.5 rounded-full bg-warning/80" />
        <span className="size-2.5 rounded-full bg-success/80" />
        <p className="ml-3 font-mono text-[11px] text-subtle">app.agentguard · live console</p>
        <span className="ml-auto hidden items-center gap-2 text-[11px] text-success sm:flex">
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
          Syncing
          <ChainMark chain="base" className="size-3.5" />
          <ChainMark chain="ethereum" className="size-3.5" />
          <ChainMark chain="solana" className="size-3.5" />
        </span>
      </div>
      <div className="grid lg:grid-cols-[210px_1fr]">
        <aside className="hidden border-r border-border p-4 lg:block">
          <p className="text-xs font-medium text-subtle">Workspace</p>
          <ul className="mt-3 space-y-1 text-sm">
            {["Overview", "Agents", "Policies", "Alerts"].map((l, i) => (
              <li
                key={l}
                className={
                  i === 0
                    ? "rounded-[10px] bg-elevated px-3 py-2 font-medium"
                    : "rounded-[10px] px-3 py-2 text-muted"
                }
              >
                {l}
              </li>
            ))}
          </ul>
        </aside>
        <div className="p-4 md:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { l: "Agent wallets", v: "3", h: "2 live · 1 demo" },
              { l: "Moved in last 24h", v: "$13,430", h: "Transfer volume, not treasury" },
              { l: "On-chain balance", v: "$61,200", h: "Native balance of live wallets" },
            ].map((c) => (
              <div key={c.l} className="rounded-[var(--radius-lg)] bg-elevated px-4 py-3">
                <p className="text-xs text-muted">{c.l}</p>
                <p className="mt-1 font-mono text-xl font-medium tabular-nums">{c.v}</p>
                <p className="mt-1 text-[11px] text-subtle">{c.h}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-subtle">
                <tr>
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">24h volume</th>
                  <th className="pb-2 font-medium">Spend vs daily cap</th>
                </tr>
              </thead>
              <tbody>
                {AGENTS.map((a) => (
                  <tr key={a.name} className="border-t border-border">
                    <td className="py-3">
                      <p className="font-medium">{a.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
                        <ChainBadge chain={a.chain} />
                        <span className="rounded-full bg-elevated px-1.5 py-0.5">{a.tag}</span>
                      </p>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="font-mono tabular-nums">{a.vol}</td>
                    <td className="w-44">
                      <div className="flex items-center gap-2">
                        <Progress value={a.pct} tone={a.pct > 60 ? "warning" : "success"} />
                        <span className="w-8 text-right font-mono text-xs text-muted">{a.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-[var(--radius-lg)] bg-bg p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Activity</p>
              <p className="text-[11px] text-subtle">Pre-sign checks · on-chain transfers</p>
            </div>
            <ul className="space-y-2.5">
              {FEED.map((f) => (
                <li key={f.t + f.ev} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      f.tone === "bad"
                        ? "size-2 shrink-0 rounded-full bg-danger"
                        : "size-2 shrink-0 rounded-full bg-success"
                    }
                  />
                  <span className="w-10 shrink-0 font-mono text-[11px] text-subtle">{f.t}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-fg">{f.ev}</span>
                    <span className="text-muted"> · {f.agent}</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted">{f.amt}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
