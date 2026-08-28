import { ChainMark } from "@/components/chain-icons";
import { ChainBadge, StatusBadge } from "@/components/status";
import { Progress } from "@/components/ui/progress";

const AGENTS = [
  {
    name: "Solana Router",
    chain: "solana" as const,
    tag: "Demo",
    status: "healthy" as const,
    vol: "$1,080",
    pct: 13,
  },
  {
    name: "Treasury Bot",
    chain: "ethereum" as const,
    tag: "Demo",
    status: "warning" as const,
    vol: "$8,140",
    pct: 68,
  },
  {
    name: "Trade Agent Alpha",
    chain: "base" as const,
    tag: "Demo",
    status: "healthy" as const,
    vol: "$4,210",
    pct: 14,
  },
];

const FEED = [
  { t: "now", agent: "Treasury Bot", ev: "Pre-sign blocked", amt: "$2,400", tone: "bad" as const },
  { t: "12s", agent: "Solana Router", ev: "Transfer allowed", amt: "$180", tone: "ok" as const },
  { t: "4m", agent: "Trade Agent Alpha", ev: "Swap allowed", amt: "$640", tone: "ok" as const },
  { t: "9m", agent: "Treasury Bot", ev: "Pre-sign allowed", amt: "$420", tone: "ok" as const },
];

export function LandingDemoDashboard() {
  return (
    <div className="mt-8 overflow-hidden rounded-[28px] border border-border bg-surface shadow-[var(--shadow-panel)]">
      <div className="flex items-center gap-2 border-b border-border bg-elevated/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-danger/80" />
        <span className="size-2.5 rounded-full bg-warning/80" />
        <span className="size-2.5 rounded-full bg-success/80" />
        <p className="ml-3 font-mono text-[11px] text-subtle">agent-control · console</p>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-subtle">
          Demo · sample
          <ChainMark chain="solana" className="size-5" />
          <ChainMark chain="ethereum" className="size-5" />
          <ChainMark chain="base" className="size-5" />
        </span>
      </div>

      <div className="p-4 md:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { l: "Agent wallets", v: "3", h: "Demo · sample" },
            { l: "Moved in last 24h", v: "$13,430", h: "Demo · sample spend" },
            { l: "On-chain balance", v: "$61,200", h: "Demo · sample balance" },
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
                      <span className="w-8 text-right font-mono text-xs text-muted">
                        {a.pct}%
                      </span>
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
            <p className="text-[11px] text-subtle">Demo · sample · blocked + allowed</p>
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
  );
}
