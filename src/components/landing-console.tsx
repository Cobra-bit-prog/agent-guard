import { ChainMark } from "@/components/chain-icons";
import { ChainBadge, StatusBadge } from "@/components/status";
import { Progress } from "@/components/ui/progress";

const AGENTS = [
  {
    name: "Solana Router",
    chain: "solana" as const,
    tag: "Live",
    status: "healthy" as const,
    vol: "$1,080",
    pct: 13,
  },
  {
    name: "Treasury Bot",
    chain: "ethereum" as const,
    tag: "Live",
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

export function LandingConsole() {
  return (
    <div className="mt-12 overflow-hidden rounded-[28px] border border-border bg-surface shadow-[var(--shadow-panel)] landing-rise">
      <div className="flex items-center gap-2 border-b border-border bg-elevated/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-danger/80" />
        <span className="size-2.5 rounded-full bg-warning/80" />
        <span className="size-2.5 rounded-full bg-success/80" />
        <p className="ml-3 font-mono text-[11px] text-subtle">
          agent-control · live console
        </p>
        <span className="ml-auto hidden items-center gap-2 text-[11px] text-success sm:flex">
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
          Syncing
          <ChainMark chain="solana" className="size-5" />
          <ChainMark chain="ethereum" className="size-5" />
          <ChainMark chain="base" className="size-5" />
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
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

        <aside className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">
            Pre-sign check
          </p>
          <div className="landing-block-card relative mt-3 overflow-hidden rounded-[18px] border border-border bg-elevated p-4">
            <p className="font-mono text-[11px] text-subtle">Treasury Bot · Ethereum</p>
            <p className="mt-2 text-sm text-muted">to 0x91c4…a2e1</p>
            <p className="mt-1 font-mono text-2xl font-medium tabular-nums">$2,400</p>
            <div className="relative mt-4 h-9">
              <div className="landing-check-pending absolute inset-0 flex flex-col justify-center">
                <p className="text-xs text-warning">Checking policy…</p>
                <span className="landing-scan-bar mt-2 h-1 rounded-full bg-warning/80" />
              </div>
              <div className="landing-check-blocked absolute inset-0 flex flex-col justify-center">
                <p className="text-xs font-medium text-danger">blocked · over daily cap</p>
                <p className="mt-1 text-[11px] text-muted">Signature never left the agent.</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            The agent called <span className="font-mono text-fg">/api/v1/check</span> before
            signing. Policy said no, so the send never broadcast.
          </p>
        </aside>
      </div>
    </div>
  );
}
