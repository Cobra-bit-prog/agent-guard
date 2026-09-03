import { useState, type ReactNode } from "react";

/** Marketing product tabs. Do not import @/lib/pay-extension — that module is not SSR-safe. */

type ProductTab = "dashboard" | "audit" | "inbox";

const PRODUCT_TABS: { id: ProductTab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "audit", label: "Agent Audit" },
  { id: "inbox", label: "Approval Inbox" },
];

const INBOX_ROWS = [
  { title: "Transfer $2,400", detail: "To unknown address · Held" },
  { title: "Transfer $850", detail: "Over daily cap · Held" },
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

const DASHBOARD_AGENTS = [
  { name: "Treasury Bot", spend: "$8,140", cap: "68%", tone: "warn" as const },
  { name: "Solana Router", spend: "$1,080", cap: "13%", tone: "ok" as const },
] as const;

function PreviewCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-[22px] shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
      {children}
    </div>
  );
}

function ProductTabButton({
  id,
  label,
  selected,
  onSelect,
}: {
  id: ProductTab;
  label: string;
  selected: boolean;
  onSelect: (next: ProductTab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      className={
        selected
          ? "shrink-0 whitespace-nowrap rounded-full bg-navy px-3.5 py-2 text-sm font-semibold text-white sm:px-4"
          : "shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold text-muted hover:text-fg sm:px-4"
      }
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}

function DashboardPanel({
  warningAlerts,
  onToggleWarningAlerts,
}: {
  warningAlerts: boolean;
  onToggleWarningAlerts: () => void;
}) {
  return (
    <div
      role="tabpanel"
      id="panel-dashboard"
      aria-labelledby="tab-dashboard"
      className="mt-4 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start"
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h2>
        <p className="mt-2 max-w-[42ch] text-muted">
          Monitoring and spend overview for enrolled agents. See what is within policy, what is
          over a cap, and which alerts need a look.
        </p>
        <p className="mt-3 text-sm text-muted">
          Warning alerts are optional. Turn them on if you want a ping for suspicious or
          over-limit activity — you can leave them off. After you sign in, Email alerts in
          Settings is the real switch (this preview does not send mail).
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
          <p className="text-sm font-semibold">Overview</p>
          <span className="rounded-full border border-border bg-white px-2.5 py-0.5 text-[11px] text-muted">
            Today ▾
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <div>
            <p className="text-[11px] text-muted">Spent today</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight">$1,240</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Daily cap</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight">$5,000</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Open alerts</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight text-danger">1</p>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
            <span>Spend vs policy</span>
            <span className="font-medium text-success">Within policy</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e8eef6]">
            <div className="h-full w-[25%] rounded-full bg-chart" />
          </div>
        </div>
        <ul className="mt-3">
          {DASHBOARD_AGENTS.map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between gap-2 border-t border-border py-2.5"
            >
              <div>
                <b className="block text-[13px]">{row.name}</b>
                <span className="text-xs text-muted">{row.spend} today</span>
              </div>
              <span
                className={
                  row.tone === "warn"
                    ? "text-xs font-semibold text-warning"
                    : "text-xs font-semibold text-success"
                }
              >
                {row.cap} of cap
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-1 flex items-start justify-between gap-3 rounded-[14px] border border-border bg-elevated px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Warning alerts</p>
            <p className="mt-0.5 text-xs leading-snug text-muted">
              Optional. Suspicious or over-limit activity — only if you want the ping.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={warningAlerts}
            aria-label="Warning alerts"
            className={
              warningAlerts
                ? "relative h-6 w-10 shrink-0 rounded-full bg-coral"
                : "relative h-6 w-10 shrink-0 rounded-full bg-[#dce4ee]"
            }
            onClick={onToggleWarningAlerts}
          >
            <span
              className={
                warningAlerts
                  ? "absolute top-0.5 right-0.5 block size-5 rounded-full bg-white"
                  : "absolute top-0.5 left-0.5 block size-5 rounded-full bg-white"
              }
            />
          </button>
        </div>
        {warningAlerts ? (
          <div className="mt-2.5 flex items-center gap-2.5 rounded-[14px] border border-[#f6c9c2] bg-[#fdecea] px-3.5 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-coral text-xs font-bold text-white">
              !
            </span>
            <div className="min-w-0">
              <strong className="block text-[13px] text-danger">Warning alert</strong>
              <p className="text-xs leading-snug text-fg">
                Suspicious spend · Treasury Bot over limit
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2.5 text-xs text-muted">
            Alerts off. Over-limit activity still shows in the console — no extra ping.
          </p>
        )}
        <p className="mt-2 text-[11px] text-subtle">
          Preview only — this toggle does not send email. After you sign in, Email alerts in
          Settings is the real switch.
        </p>
      </PreviewCard>
    </div>
  );
}

function AuditPanel() {
  return (
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
                  <td className="whitespace-nowrap border-t border-border py-2 pr-2">{row.time}</td>
                  <td className="whitespace-nowrap border-t border-border py-2 pr-2">{row.kind}</td>
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
  );
}

function InboxPanel() {
  return (
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
        <p className="mb-1 text-xs text-muted">Held · 10-minute hold if you do not decide</p>
        <ul>
          {INBOX_ROWS.map((row) => (
            <li key={row.title} className="border-t border-border py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <b className="block text-[13px]">{row.title}</b>
                  <span className="text-xs text-muted">{row.detail}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <a
                  href="/signup"
                  className="inline-flex items-center rounded-[10px] bg-coral px-2.5 py-1.5 text-xs font-semibold text-white"
                >
                  Allow once
                </a>
                <a
                  href="/signup"
                  className="inline-flex items-center rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-navy"
                >
                  Always allow
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
  );
}

export function LandingProductTabs() {
  const [tab, setTab] = useState<ProductTab>("dashboard");
  const [warningAlerts, setWarningAlerts] = useState(true);

  return (
    <section className="mx-auto max-w-[1140px] px-5 pb-9 pt-1 md:px-6" aria-label="Product">
      <div className="max-w-full overflow-x-auto">
        <div
          role="tablist"
          aria-label="Product"
          className="inline-flex rounded-full border border-border bg-white p-1 shadow-[0_1px_0_rgb(18_38_63/0.04)]"
        >
          {PRODUCT_TABS.map((item) => (
            <ProductTabButton
              key={item.id}
              id={item.id}
              label={item.label}
              selected={tab === item.id}
              onSelect={setTab}
            />
          ))}
        </div>
      </div>

      {tab === "dashboard" ? (
        <DashboardPanel
          warningAlerts={warningAlerts}
          onToggleWarningAlerts={() => setWarningAlerts((on) => !on)}
        />
      ) : tab === "audit" ? (
        <AuditPanel />
      ) : (
        <InboxPanel />
      )}
    </section>
  );
}
