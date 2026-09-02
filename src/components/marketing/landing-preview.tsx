const BARS = [18, 24, 22, 30, 38, 52, 68, 86, 62, 74, 48, 40, 34, 28, 24, 18];

export function LandingPreview() {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-[22px] shadow-[0_28px_56px_-28px_rgb(18_38_63/0.32)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">Spent today</p>
          <p className="mt-0.5 text-[34px] font-bold leading-none tracking-tight">$1,240</p>
          <span className="mt-2 inline-flex items-center rounded-full bg-[#dcfce7] px-2 py-0.5 text-xs font-medium text-[#166534]">
            Within policy
          </span>
        </div>
        <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs text-muted">
          Today ▾
        </span>
      </div>

      <div className="mt-3.5 grid grid-cols-[40px_1fr] items-stretch gap-2">
        <div className="flex flex-col justify-between py-0.5 text-right text-[11px] text-subtle">
          <span>$1.5k</span>
          <span>$1k</span>
          <span>$500</span>
          <span>$0</span>
        </div>
        <div className="flex h-24 items-end gap-2">
          {BARS.map((h, i) => (
            <i
              key={i}
              className="block flex-1 rounded-[3px] bg-chart not-italic"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between pl-[48px] text-[11px] text-subtle">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-[#f6c9c2] bg-[#fdecea] px-3.5 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-coral text-sm font-bold text-white">
          !
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-[13px] text-danger">Review alert</strong>
          <p className="mt-0.5 text-[13px] leading-snug text-fg">
            Transfer paused
            <span className="block sm:inline sm:before:content-['\00a0']">
              $2,400 to unknown address
            </span>
          </p>
        </div>
        <a
          href="/signup"
          className="ml-auto inline-flex h-9 shrink-0 items-center rounded-full bg-coral px-3.5 text-sm font-semibold text-white"
        >
          Review
        </a>
      </div>

      <div className="mt-3.5 grid gap-3 border-t border-border pt-3.5 sm:grid-cols-2">
        <div>
          <b className="flex items-center gap-1.5 text-[13px] text-fg">
            <span aria-hidden>🛡</span> Policy
          </b>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            Daily cap $5,000 · Per-tx cap $2,000
          </p>
        </div>
        <div>
          <b className="flex items-center gap-1.5 text-[13px] text-fg">
            <span className="grid size-[18px] place-items-center rounded-full bg-[#dcfce7] text-[10px] font-bold text-[#166534]">
              ✓
            </span>
            Keys
          </b>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            Held by you · Agent cannot move funds
          </p>
        </div>
      </div>
    </div>
  );
}
