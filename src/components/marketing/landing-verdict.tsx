import { useState } from "react";
import { Button } from "@/components/ui/button";

const EXAMPLE_ROWS = [
  { tone: "fine" as const, amount: "$180", detail: "USDC to a known market maker" },
  { tone: "fine" as const, amount: "$12", detail: "SOL rent for a program account" },
  { tone: "wait" as const, amount: "$2,400", detail: "First-time address" },
  { tone: "stop" as const, amount: "$9,100", detail: "Over the daily cap" },
];

const TONE_CHIP: Record<(typeof EXAMPLE_ROWS)[number]["tone"], string> = {
  fine: "text-[#166534] bg-[#dcfce7]",
  wait: "text-[#92400e] bg-[#fef3c7]",
  stop: "text-[#991b1b] bg-[#fee2e2]",
};

export function LandingVerdict() {
  const [open, setOpen] = useState(false);

  return (
    <section id="week" className="border-t border-border bg-white/40">
      <div className="mx-auto max-w-[1140px] px-5 py-12 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-navy">New</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
          Paste the wallet. See what would not have left.
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Example week from a research agent — or paste yours. Read-only. We never hold the keys.
        </p>
        <form
          className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          <input
            name="addr"
            placeholder="Paste a wallet"
            autoComplete="off"
            className="h-11 flex-1 rounded-full border border-border bg-white px-4 text-sm text-fg outline-none"
          />
          <Button type="submit" size="lg" className="rounded-full">
            Open an example
          </Button>
        </form>
        {open ? (
          <div className="mt-5 max-w-2xl">
            <div className="rounded-[20px] border border-border bg-surface p-5">
              <p className="text-xs text-muted">Example week · research agent</p>
              <p className="mt-2 text-lg font-semibold">
                2 fine, 1 would wait, 1 would stop. $9,100 would not have left.
              </p>
              {EXAMPLE_ROWS.map((row) => (
                <div key={`${row.tone}-${row.amount}`}>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CHIP[row.tone]}`}
                    >
                      {row.tone}
                    </span>
                    <span className="tabular-nums">{row.amount}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{row.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
