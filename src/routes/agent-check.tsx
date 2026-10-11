import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import {
  AGENT_CHECK_API_PATH,
  AGENT_CHECK_CAVEAT,
  AGENT_CHECK_DAYS,
  AGENT_CHECK_DIRECTORY_LINE,
  AGENT_CHECK_HIRE_LINE,
  AGENT_CHECK_HONESTY,
  AGENT_CHECK_LINE,
  AGENT_CHECK_PAY_LINE,
  AGENT_CHECK_PRICE_USD,
  AGENT_CHECK_REPORT_PATH,
} from "@/lib/agent-check/copy";
import { trackAgentCheckRun, trackAgentReportStart } from "@/lib/site-events";

export const Route = createFileRoute("/agent-check")({
  component: AgentCheckPage,
  head: () => ({
    meta: [
      { title: "Can an agent use this site? — Agent Control" },
      {
        name: "description",
        content:
          "Check how an AI agent finds and uses your site. The first 5 checks are free. The full report is $19 USDC.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Can an agent use this site? — Agent Control" },
      {
        property: "og:description",
        content: "A pass does not mean a crawler or an agent will use the site.",
      },
    ],
  }),
});

type CheckRow = {
  id: string;
  title: string;
  status: "pass" | "fail" | "warn" | "unchecked";
  detail: string;
  fix?: string;
};

type FreeBody = {
  checks?: CheckRow[];
  caveat?: string;
  error?: string;
  passed?: number;
  failed?: number;
  warned?: number;
};

type InvoiceBody = {
  invoice_id?: string;
  status?: string;
  reference?: string;
  pay_to?: string;
  base_pay_to?: string;
  amount_base_units?: string;
  amount_usd?: number;
  sku?: string;
  asset?: string;
  accepts?: unknown;
  line?: string;
  note?: string;
  pay?: string;
  error?: string;
  recorded?: boolean;
  rechecks_left?: number;
  report_until?: string | null;
  report?: { checks?: CheckRow[]; caveat?: string };
};

const STATUS_LABEL: Record<CheckRow["status"], string> = {
  pass: "Pass",
  fail: "Fail",
  warn: "Check",
  unchecked: "Could not check",
};

function CheckList({ checks }: { checks: CheckRow[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {checks.map((check) => (
        <li key={check.id} className="rounded-[20px] border border-border bg-surface p-4">
          <p className="text-meta font-medium uppercase tracking-[0.14em] text-coral">
            {STATUS_LABEL[check.status] ?? check.status}
          </p>
          <h3 className="mt-1 text-card font-medium">{check.title}</h3>
          <p className="mt-2 text-body text-muted">{check.detail}</p>
          {check.fix ? (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-bg p-3 font-mono text-meta text-fg">{check.fix}</pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function AgentCheckPage() {
  const [value, setValue] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [free, setFree] = useState<FreeBody | null>(null);
  const [invoice, setInvoice] = useState<InvoiceBody | null>(null);
  const [payPending, setPayPending] = useState(false);

  async function onCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInvoice(null);
    setPending(true);
    const trimmed = value.trim();
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const response = await fetch(AGENT_CHECK_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, company_website: companyWebsite }),
      });
      const payload = (await response.json()) as FreeBody;
      if (!response.ok || !payload.checks) throw new Error(payload.error || "Could not run this check.");
      setFree(payload);
      setCompanyWebsite("");
      trackAgentCheckRun();
    } catch (err) {
      setFree(null);
      setError(err instanceof Error ? err.message : "Could not run this check.");
    } finally {
      setPending(false);
    }
  }

  async function onReport() {
    setError(null);
    setPayPending(true);
    const trimmed = value.trim();
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const response = await fetch(AGENT_CHECK_REPORT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as InvoiceBody;
      if (!payload.invoice_id) throw new Error(payload.error || "Could not start the report.");
      setInvoice(payload);
      trackAgentReportStart();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the report.");
    } finally {
      setPayPending(false);
    }
  }

  async function onWatch(recheck = false) {
    if (!invoice?.invoice_id) return;
    setPayPending(true);
    setError(null);
    try {
      const response = await fetch(AGENT_CHECK_REPORT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.invoice_id, recheck }),
      });
      const payload = (await response.json()) as InvoiceBody;
      if (!payload.invoice_id) throw new Error(payload.error || "Could not read this payment.");
      setInvoice(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this payment.");
    } finally {
      setPayPending(false);
    }
  }

  const paid = (invoice?.status ?? "").toLowerCase() === "paid";
  const reportChecks = invoice?.report?.checks ?? [];

  return (
    <SkyShell>
      <main className="mx-auto min-w-0 max-w-3xl overflow-x-hidden px-6 pb-20 pt-8 md:px-10">
        <p className="text-meta font-medium uppercase tracking-[0.18em] text-coral">Agent-readiness check</p>
        <h1 className="mt-3 text-display font-semibold">Can an agent use this site?</h1>
        <p className="mt-4 max-w-[52ch] text-body text-muted">
          Paste your site. We read robots.txt, llms.txt, agents.json, the agent card, the MCP file, and
          skill.md, then say what an agent would trip over.
        </p>
        <p className="mt-3 max-w-[52ch] text-body text-muted">{AGENT_CHECK_CAVEAT}</p>

        <form className="mt-8 space-y-3" onSubmit={onCheck}>
          <label className="block text-body font-medium" htmlFor="agent-site">
            Site URL
          </label>
          <input
            id="agent-site"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://example.com"
            autoComplete="off"
            inputMode="url"
            required
          />
          <input
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            value={companyWebsite}
            onChange={(event) => setCompanyWebsite(event.target.value)}
            aria-hidden="true"
          />
          <button
            type="submit"
            className="rounded-full bg-navy px-5 py-2 text-body font-medium text-white disabled:opacity-60"
            disabled={pending}
          >
            {pending ? "Checking…" : "Run the free check"}
          </button>
        </form>
        {error ? <p className="mt-4 text-body text-coral">{error}</p> : null}

        {free?.checks ? (
          <section className="mt-10" aria-labelledby="free-checks">
            <h2 id="free-checks" className="text-title font-semibold">
              Free result
            </h2>
            <p className="mt-2 text-body text-muted">
              {free.passed ?? 0} passed, {free.failed ?? 0} failed
              {free.warned ? `, ${free.warned} to check` : ""}. The first 5 checks only.
            </p>
            <CheckList checks={free.checks} />
            <p className="mt-4 text-body text-muted">{free.caveat}</p>
          </section>
        ) : null}

        {free?.checks && !paid ? (
          <section className="mt-10 rounded-[20px] border border-border bg-surface p-5" aria-labelledby="report-pay">
            <h2 id="report-pay" className="text-title font-semibold">
              Full report — ${AGENT_CHECK_PRICE_USD} USDC
            </h2>
            <p className="mt-2 text-body text-muted">{AGENT_CHECK_LINE}</p>
            <p className="mt-2 text-body text-muted">
              {AGENT_CHECK_HONESTY} {AGENT_CHECK_PAY_LINE} The window is {AGENT_CHECK_DAYS} days.
            </p>
            <button
              type="button"
              className="mt-4 rounded-full bg-coral px-5 py-2 text-body font-medium text-white disabled:opacity-60"
              onClick={() => void onReport()}
              disabled={payPending}
            >
              {payPending ? "Starting…" : `Start the $${AGENT_CHECK_PRICE_USD} report`}
            </button>
          </section>
        ) : null}

        {invoice?.invoice_id ? (
          <section className="mt-8" aria-labelledby="invoice">
            <h2 id="invoice" className="text-title font-semibold">
              {paid ? "Report payment" : "Payment required — HTTP 402"}
            </h2>
            {invoice.error ? <p className="mt-2 text-body text-coral">{invoice.error}</p> : null}
            <dl className="mt-4 space-y-2 text-body">
              <div>
                <dt className="text-muted">Status</dt>
                <dd>{invoice.status}</dd>
              </div>
              <div>
                <dt className="text-muted">Amount</dt>
                <dd>
                  ${invoice.amount_usd} {invoice.asset} ({invoice.amount_base_units} base units)
                </dd>
              </div>
              <div>
                <dt className="text-muted">Base payTo</dt>
                <dd className="break-all font-mono text-meta">{invoice.base_pay_to}</dd>
              </div>
              <div>
                <dt className="text-muted">Solana payTo</dt>
                <dd className="break-all font-mono text-meta">{invoice.pay_to}</dd>
              </div>
              <div>
                <dt className="text-muted">Reference</dt>
                <dd className="break-all font-mono text-meta">{invoice.reference}</dd>
              </div>
            </dl>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-bg p-3 font-mono text-meta text-fg">
              {JSON.stringify(
                {
                  invoice_id: invoice.invoice_id,
                  sku: invoice.sku,
                  price_usd: invoice.amount_usd,
                  status: invoice.status,
                  pay_to: invoice.pay_to,
                  base_pay_to: invoice.base_pay_to,
                  amount_base_units: invoice.amount_base_units,
                  asset: invoice.asset,
                  reference: invoice.reference,
                  accepts: invoice.accepts,
                  line: invoice.line,
                  note: invoice.note,
                  pay: invoice.pay,
                },
                null,
                2,
              )}
            </pre>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-full border border-border px-4 py-2 text-body"
                onClick={() => void onWatch(false)}
                disabled={payPending}
              >
                Check payment
              </button>
              {paid && (invoice.rechecks_left ?? 0) > 0 ? (
                <button
                  type="button"
                  className="rounded-full border border-border px-4 py-2 text-body"
                  onClick={() => void onWatch(true)}
                  disabled={payPending}
                >
                  Use the free re-check
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {reportChecks.length ? (
          <section className="mt-10" aria-labelledby="full-report">
            <h2 id="full-report" className="text-title font-semibold">
              Full report
            </h2>
            <CheckList checks={reportChecks} />
            <p className="mt-4 text-body text-muted">{invoice?.report?.caveat}</p>
          </section>
        ) : null}

        <p className="mt-10 text-body text-muted">
          <a href="/hire" className="font-medium text-navy hover:text-coral">
            {AGENT_CHECK_HIRE_LINE}
          </a>
          . {AGENT_CHECK_DIRECTORY_LINE}{" "}
          <a href="/directory" className="font-medium text-navy hover:text-coral">
            Directory
          </a>
          {" · "}
          <a href="/directory#featured" className="font-medium text-navy hover:text-coral">
            Feature for $19
          </a>
          .
        </p>
      </main>
    </SkyShell>
  );
}
