import type { ReactNode } from "react";
import { PayQr } from "@/components/pay-qr";

/** Marketing modules. Do not import @/lib/pay-extension — that module is not SSR-safe. */

const AUDIT_ROWS = [
  { time: "May 20, 10:42 AM", to: "0x7f3a…b9c1", amount: "$350.00", result: "Allowed", kind: "ok" },
  {
    time: "May 20, 10:28 AM",
    to: "7GdK…Lr9e",
    amount: "$1,200.00",
    result: "Paused",
    kind: "pause",
  },
  {
    time: "May 20, 10:15 AM",
    to: "0x91aa…c0de",
    amount: "$780.00",
    result: "Aborted",
    kind: "abort",
  },
] as const;

const INBOX_ROWS = [
  { title: "Transfer $2,400", detail: "To unknown address" },
  { title: "Transfer $850", detail: "To vendor wallet" },
  { title: "Approve spend $1,000", detail: "For AI research" },
] as const;

const PAY_ASSETS = [
  { id: "usdc", label: "USDC", swatch: "bg-[#2775ca]" },
  { id: "sol", label: "SOL", swatch: "bg-[#14f195]" },
  { id: "eth", label: "ETH", swatch: "bg-[#627eea]" },
] as const;

function exportAuditCsv() {
  const csv =
    "Time,To,Amount,Result\nMay 20 10:42 AM,0x7f3a...b9c1,$350.00,Allowed\nMay 20 10:28 AM,7GdK...Lr9e,$1200.00,Paused\nMay 20 10:15 AM,0x91aa...c0de,$780.00,Aborted\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "ghost-audit-sample.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function ModuleCard({ children }: { children: ReactNode }) {
  return (
    <article className="flex min-h-full flex-col rounded-[20px] border border-border bg-surface p-[22px] shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
      {children}
    </article>
  );
}

function ModuleNum({ n }: { n: number }) {
  return (
    <span className="inline-grid size-[26px] shrink-0 place-items-center rounded-full bg-[#e8eef6] text-xs font-bold text-navy">
      {n}
    </span>
  );
}

export function LandingModules() {
  return (
    <section className="mx-auto max-w-[1140px] px-5 pb-9 pt-1 md:px-6" aria-label="Product modules">
      <div className="grid gap-3.5 md:grid-cols-3">
        <ModuleCard>
          <h3 className="mb-2 flex items-center gap-2.5 text-lg font-semibold">
            <ModuleNum n={1} />
            <a href="/alerts" className="text-fg hover:text-coral">
              Ghost audit
            </a>
          </h3>
          <p className="text-sm text-muted">
            Replay the last sends in a read-only view. Understand what happened, verify policy, and
            export for your records.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left font-medium text-subtle">
                  <th className="border-b border-border px-1.5 py-2">Time</th>
                  <th className="border-b border-border px-1.5 py-2">To</th>
                  <th className="border-b border-border px-1.5 py-2">Amount</th>
                  <th className="border-b border-border px-1.5 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {AUDIT_ROWS.map((row) => (
                  <tr key={row.to}>
                    <td className="whitespace-nowrap border-t border-border px-1.5 py-2.5">
                      {row.time}
                    </td>
                    <td className="whitespace-nowrap border-t border-border px-1.5 py-2.5 font-mono text-[11px]">
                      {row.to}
                    </td>
                    <td className="whitespace-nowrap border-t border-border px-1.5 py-2.5">
                      {row.amount}
                    </td>
                    <td
                      className={
                        row.kind === "ok"
                          ? "whitespace-nowrap border-t border-border px-1.5 py-2.5 font-semibold text-success"
                          : row.kind === "pause"
                            ? "whitespace-nowrap border-t border-border px-1.5 py-2.5 font-semibold text-warning"
                            : "whitespace-nowrap border-t border-border px-1.5 py-2.5 font-semibold text-danger"
                      }
                    >
                      {row.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-semibold text-navy hover:text-coral"
            onClick={exportAuditCsv}
          >
            📄 Export CSV
          </button>
        </ModuleCard>

        <ModuleCard>
          <h3 className="mb-2 flex items-center gap-2.5 text-lg font-semibold">
            <ModuleNum n={2} />
            <a href="/signup" className="text-fg hover:text-coral">
              Approval inbox
            </a>
            <span className="ml-auto inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">
              3
            </span>
          </h3>
          <p className="text-sm text-muted">
            Your agent requests, your call. Approve once, set limits, or block. Nothing moves
            without you.
          </p>
          <p className="mt-3 text-xs font-semibold text-muted">Waiting for you</p>
          <ul>
            {INBOX_ROWS.map((row) => (
              <li
                key={row.title}
                className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-2.5 first:mt-0"
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
          <a
            href="/signup"
            className="mt-3 inline-block text-[13px] font-semibold text-navy hover:text-coral"
          >
            View all requests →
          </a>
        </ModuleCard>

        <ModuleCard>
          <h3 className="mb-2 flex items-center gap-2.5 text-lg font-semibold">
            <ModuleNum n={3} />
            <a href="/billing" className="text-fg hover:text-coral">
              On-chain pay
            </a>
          </h3>
          <p className="text-sm text-muted">
            Collect payments directly to your wallet. Scan a link or QR. Set your price. No card. No
            KYC.
          </p>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2 sm:items-stretch">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted">Pay with</p>
              <div className="flex flex-col gap-2">
                {PAY_ASSETS.map((asset) => (
                  <a
                    key={asset.id}
                    href="/billing"
                    className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-[13px] font-semibold text-fg hover:border-[#c5d4e6]"
                  >
                    <span className={`size-2.5 shrink-0 rounded-full ${asset.swatch}`} />
                    {asset.label}
                  </a>
                ))}
              </div>
            </div>
            <a
              href="/billing"
              className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-border bg-elevated p-3 text-center text-xs text-muted"
            >
              <span className="block w-full max-w-[132px] rounded-lg border border-border bg-white p-1.5">
                <PayQr
                  value="https://agent-control.net/billing"
                  alt="Open Billing to pay on-chain"
                />
              </span>
              Scan to pay
              <span>or share payment link</span>
            </a>
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-success">
            <span className="grid size-[18px] place-items-center rounded-full bg-[#dcfce7] text-[10px] text-[#166534]">
              ✓
            </span>
            No card. No KYC. Live invoice is on Billing.
          </p>
        </ModuleCard>
      </div>
    </section>
  );
}
