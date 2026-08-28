import { ChainMark } from "@/components/chain-icons";

export function LandingConsole() {
  return (
    <div className="mt-12 overflow-hidden rounded-[28px] border border-border bg-surface shadow-[var(--shadow-panel)] landing-rise">
      <div className="flex items-center gap-2 border-b border-border bg-elevated/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-danger/80" />
        <span className="size-2.5 rounded-full bg-warning/80" />
        <span className="size-2.5 rounded-full bg-success/80" />
        <p className="ml-3 font-mono text-[11px] text-subtle">agent-control · console</p>
        <span className="ml-auto font-mono text-[11px] text-subtle">Demo · sample check</span>
      </div>

      <div className="flex flex-col items-center px-5 py-10 md:px-10 md:py-14">
        <div className="landing-block-card relative w-full max-w-md overflow-hidden rounded-[22px] border border-border bg-elevated p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">
            Pre-sign check
          </p>
          <div className="mt-5 flex items-center gap-2">
            <ChainMark chain="ethereum" className="size-6" />
            <p className="font-mono text-xs text-subtle">Treasury Bot · Ethereum</p>
          </div>
          <p className="mt-5 text-sm text-muted">to 0x91c4…a2e1</p>
          <p className="mt-1 font-mono text-4xl font-medium tabular-nums tracking-tight md:text-5xl">
            $2,400
          </p>
          <div className="relative mt-6 min-h-[3.5rem]">
            <div className="landing-check-pending absolute inset-0 flex flex-col justify-center">
              <p className="text-sm text-warning">Checking policy…</p>
              <span className="landing-scan-bar mt-2 h-1 rounded-full bg-warning/80" />
            </div>
            <div className="landing-check-blocked absolute inset-0 flex flex-col justify-center">
              <p className="text-sm font-medium text-danger">blocked · over daily cap</p>
              <p className="mt-1 text-xs text-muted">Signature never left the agent.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex w-full max-w-md items-center gap-3 text-sm">
          <span className="size-2 shrink-0 rounded-full bg-danger" />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-fg">Pre-sign blocked</span>
            <span className="text-muted"> · Treasury Bot</span>
          </span>
          <span className="font-mono text-xs tabular-nums text-muted">$2,400</span>
        </div>
      </div>
    </div>
  );
}
