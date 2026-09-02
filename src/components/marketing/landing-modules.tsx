import { useState, type ReactNode } from "react";

/** Marketing product tabs. Do not import @/lib/pay-extension — that module is not SSR-safe. */

const INBOX_ROWS = [
  { title: "Transfer $2,400", detail: "To unknown address" },
  { title: "Transfer $850", detail: "Over daily cap" },
] as const;

const AUDIT_ROWS = [
  {
    time: "10:42 AM",
    kind: "check",
    to: "0x7f3a…b9c1",
    amount: "$350.00",
    result: "Checked",
    tone: "ok",
  },
  {
    time: "10:28 AM",
    kind: "send",
    to: "7GdK…Lr9e",
    amount: "$1,200.00",
    result: "Held",
    tone: "hold",
  },
  {
    time: "10:15 AM",
    kind: "check",
    to: "0x91aa…c0de",
    amount: "$780.00",
    result: "Blocked",
    tone: "block",
  },
] as const;

function PreviewCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-[22px] shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
      {children}
    </div>
  );
}

export function LandingProductTabs() {
  const [tab, setTab] = useState<"inbox" | "audit">("inbox");

  return (
    <section className="mx-auto max-w-[1140px] px-5 pb-9 pt-1 md:px-6" aria-label="Product">
      <div
        role="tablist"
        aria-label="Product"
        className="inline-flex rounded-full border border-border bg-white p-1 shadow-[0_1px_0_rgb(18_38_63/0.04)]"
      >
        <button
          type="button"
          role="tab"
          id="tab-inbox"
          aria-selected={tab === "inbox"}
          aria-controls="panel-inbox"
          className={
            tab === "inbox"
              ? "rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full px-4 py-2 text-sm font-semibold text-muted hover:text-fg"
          }
          onClick={() => setTab("inbox")}
        >
          Approval Inbox
        </button>
        <button
          type="button"
          role="tab"
          id="tab-audit"
          aria-selected={tab === "audit"}
          aria-controls="panel-audit"
          className={
            tab === "audit"
              ? "rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full px-4 py-2 text-sm font-semibold text-muted hover:text-fg"
          }
          onClick={() => setTab("audit")}
        >
          Agent Audit
        </button>
      </div>

      {tab === "inbox" ? (
        <div
          role="tabpanel"
          id="panel-inbox"
          aria-labelledby="tab-inbox"
          className="mt-4 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start"
        >
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Approval Inbox</h2>
            <p className="mt-2 max-w-[42ch] text-muted">
              Off-policy and first-time destinations wait here. Allow once, always allow that
              address, or block. Requires the agent hook — a skipped check still goes through.
            </p>
            <p className="mt-3 text-sm text-muted">
              Pause and denylist still block. Holds expire in 10 minutes if you do not decide.
            </p>
            <a
              href="/signup"
              className="mt-5 inline-flex items-center text-[13px] font-semibold text-navy hover:text-coral"
            >
              Open the console →
            </a>
          </div>
          <PreviewCard>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Waiting for you</p>
              <span className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">
                2
              </span>
            </div>
            <ul>
              {INBOX_ROWS.map((row) => (
                <li
                  key={row.title}
                  className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-2.5"
                >
                  <div>
                    <b className="block text-[13px]">{row.title}</b>
                    <span className="text-xs text-muted">{row.detail}</span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <a
                      href="/signup"
                      className="inline-flex items-center rounded-[10px] bg-coral px-2.5 py-1.5 text-xs font-semibold text-white"
                    >
                      Allow once
                    </a>
                    <a
                      href="/signup"
                      className="inline-flex items-center rounded-[10px] border border-[#f0c7c2] bg-white px-2.5 py-1.5 text-xs font-semibold text-danger"
                    >
                      Block
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </PreviewCard>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-audit"
          aria-labelledby="tab-audit"
          className="mt-4 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start"
        >
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Agent Audit</h2>
            <p className="mt-2 max-w-[42ch] text-muted">
              Generate an on-demand report of an enrolled agent’s Agent Control trail — checks,
              alerts, decisions, and recorded transfers. Download Excel or PDF. Not a full on-chain
              replay.
            </p>
            <p className="mt-3 text-sm text-muted">
              Reports are generated when you ask — nothing is auto-emailed.
            </p>
            <a
              href="/signup"
              className="mt-5 inline-flex items-center text-[13px] font-semibold text-navy hover:text-coral"
            >
              Generate a report →
            </a>
          </div>
          <PreviewCard>
            <p className="text-sm font-semibold">Sample trail</p>
            <div className="miniwrap mt-3 overflow-x-auto">
              <table className="mini w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-left font-medium text-subtle">
                    <th className="border-b border-border py-2 pr-2">Time</th>
                    <th className="border-b border-border py-2 pr-2">Kind</th>
                    <th className="border-b border-border py-2 pr-2">To</th>
                    <th className="border-b border-border py-2 pr-2">Amount</th>
                    <th className="border-b border-border py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT_ROWS.map((row) => (
                    <tr key={row.to}>
                      <td className="whitespace-nowrap border-t border-border py-2 pr-2">
                        {row.time}
                      </td>
                      <td className="whitespace-nowrap border-t border-border py-2 pr-2">
                        {row.kind}
                      </td>
                      <td className="whitespace-nowrap border-t border-border py-2 pr-2 font-mono">
                        {row.to}
                      </td>
                      <td className="whitespace-nowrap border-t border-border py-2 pr-2">
                        {row.amount}
                      </td>
                      <td
                        className={
                          row.tone === "ok"
                            ? "whitespace-nowrap border-t border-border py-2 font-semibold text-success"
                            : row.tone === "hold"
                              ? "whitespace-nowrap border-t border-border py-2 font-semibold text-warning"
                              : "whitespace-nowrap border-t border-border py-2 font-semibold text-danger"
                        }
                      >
                        {row.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/signup"
                className="inline-flex items-center rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-navy"
              >
                Download Excel
              </a>
              <a
                href="/signup"
                className="inline-flex items-center rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-navy"
              >
                Download PDF
              </a>
            </div>
          </PreviewCard>
        </div>
      )}
    </section>
  );
}
