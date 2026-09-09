import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CopyCode } from "@/components/copy-code";
import { SkyShell } from "@/components/marketing/chrome";
import { Button } from "@/components/ui/button";
import type { PublicMeterLive } from "@/lib/meter/live";
import { formatUsd, timeAgo } from "@/lib/utils";

const LIVE_URL = "/api/v1/meter/live";
const SOLSCAN_ACCOUNT = "https://solscan.io/account/";
const SOLSCAN_TX = "https://solscan.io/tx/";
const PAYOUT = "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR";

const AGENT_FLOW = `curl -s https://agent-control.net/api/v1/meter/pass -X POST \\
  -H 'content-type: application/json' -d '{}'
# 402 → pay 0.25 USDC on Solana with the reference
curl -s https://agent-control.net/api/v1/meter/watch -X POST \\
  -H 'content-type: application/json' \\
  -d '{"invoice_id":"INV"}'
# 200 → X-Agent-Pass token
curl -s https://agent-control.net/api/v1/meter/scan -X POST \\
  -H 'content-type: application/json' -H 'X-Agent-Pass: TOKEN' \\
  -d '{"chain":"solana","address":"DEST"}'`;

export const Route = createFileRoute("/meter")({
  component: MeterPage,
  head: () => ({
    meta: [
      { title: "Agent Meter — agents pay themselves" },
      {
        name: "description",
        content:
          "Agent Meter is separate from the Human App. Agents pay $0.25 USDC for a 1-hour pass, then call scan and preflight. No email. No API key. No Inbox.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Agent Meter — agents pay themselves" },
      {
        property: "og:description",
        content:
          "Pass is $0.25 USDC on Solana. 1 hour, 200 calls, scan + preflight. Agents pay themselves. You keep the keys.",
      },
    ],
  }),
});

function MeterPage() {
  const live = useQuery({
    queryKey: ["meter-live"],
    queryFn: loadLive,
    refetchInterval: 20_000,
  });
  const data = live.data;

  return (
    <SkyShell current="meter">
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-8 md:px-10">
        <p className="text-meta font-medium uppercase tracking-[0.18em] text-coral">
          Agent Meter
        </p>
        <h1 className="mt-3 text-display font-semibold">Agents pay themselves</h1>
        <p className="mt-4 max-w-[54ch] text-card text-muted">
          Separate from the Human App. No email, no trial, no API key, no Approval Inbox. An agent
          buys a $0.25 USDC pass, then calls scan and preflight. Preflight is allow or stop — never
          hold.
        </p>
        <p className="mt-3 max-w-[54ch] text-body leading-snug text-fg">
          Same locked payout wallet as Human App billing. No custody. Query strings cannot retarget
          funds.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Stat
            label="USDC received"
            value={data ? formatUsd(data.usdc_received) : "—"}
            hint={data ? `${data.invoices_paid} paid passes` : "Loading settlement"}
          />
          <Stat
            label="Agents paid"
            value={data ? String(data.agents_paid) : "—"}
            hint={data ? `${data.passes_issued} passes issued` : "SQL + Helius share state"}
          />
          <Stat
            label="Calls used"
            value={data ? String(data.calls) : "—"}
            hint="scan + preflight against a live pass"
          />
          <Stat
            label="Open invoices"
            value={data ? String(data.invoices_pending) : "—"}
            hint={data ? `${formatUsd(data.usdc_pending)} pending` : "$0.25 each"}
          />
        </div>
        <p className="mt-3 text-meta text-subtle">
          {live.isError
            ? "Live totals unavailable — product copy below still holds."
            : data
              ? `Updated ${timeAgo(data.generated_at)} · GET ${LIVE_URL}`
              : "Reading settlement…"}
        </p>

        <section className="mt-12">
          <h2 className="text-title font-semibold tracking-tight">Pass</h2>
          <article className="mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
            <p className="text-card font-medium">1 hour · 200 calls</p>
            <p className="mt-2 text-title font-semibold tracking-tight">$0.25 USDC</p>
            <p className="mt-2 text-body text-muted">
              Covers scan (ok / new / warn / sink) and preflight-self (allow / stop). Solana USDC.
              Header <span className="font-mono text-fg">X-Agent-Pass</span>.
            </p>
          </article>
        </section>

        <section className="mt-12">
          <h2 className="text-title font-semibold tracking-tight">Funds</h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Locked Phantom receive address. Helius and agent watch mint the same pass when the
            transfer lands.
          </p>
          <p className="mt-4 break-all font-mono text-body text-fg">{PAYOUT}</p>
          <p className="mt-2 text-body text-muted">
            <a
              href={`${SOLSCAN_ACCOUNT}${PAYOUT}`}
              className="font-medium text-navy hover:text-coral"
              target="_blank"
              rel="noreferrer"
            >
              Open on Solscan
            </a>
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-title font-semibold tracking-tight">Recent payments</h2>
          <div className="mt-6 space-y-3">
            {!data && <p className="text-body text-muted">Waiting on settlement…</p>}
            {data && data.recent_payments.length === 0 && (
              <p className="text-body text-muted">
                No agent passes settled yet. When 0.25 USDC lands with a Solana Pay reference, the
                row appears here.
              </p>
            )}
            {data?.recent_payments.map((row) => (
              <article
                key={`${row.signature}-${row.paid_at}`}
                className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
              >
                <p className="text-card font-medium tabular-nums">{formatUsd(row.amount_usd)} USDC</p>
                <p className="mt-1 text-body text-muted">
                  {row.payer ? `Payer ${row.payer}` : "Payer not on invoice"} · {timeAgo(row.paid_at)}
                </p>
                <p className="mt-1 font-mono text-meta text-subtle">
                  <a
                    href={`${SOLSCAN_TX}${row.signature}`}
                    className="hover:text-coral"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.signature_short}
                  </a>
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-title font-semibold tracking-tight">How an agent pays</h2>
          <ol className="mt-6 space-y-3">
            {[
              {
                n: "1",
                t: "Ask for a pass",
                d: "POST /api/v1/meter/pass with no proof. HTTP 402 returns pay_to, reference, and amount.",
              },
              {
                n: "2",
                t: "Pay 0.25 USDC",
                d: "Solana Pay reference on the locked wallet. No human on the site.",
              },
              {
                n: "3",
                t: "Watch or wait for Helius",
                d: "POST /api/v1/meter/watch with invoice_id. Same job billing already does for humans.",
              },
              {
                n: "4",
                t: "Call scan + preflight",
                d: "Header X-Agent-Pass. Missing or spent pass → 402 again.",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]"
              >
                <p className="font-mono text-meta text-navy">{s.n}</p>
                <h3 className="mt-2 text-card font-medium">{s.t}</h3>
                <p className="mt-1 text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
          <CopyCode code={AGENT_FLOW} label="Copy" />
        </section>

        <section className="mt-12">
          <h2 className="text-title font-semibold tracking-tight">Not the Human App</h2>
          <p className="mt-3 max-w-[52ch] text-muted">
            Humans still sign up, own Approval Inbox, and pay $29 / $49 / $149. Meter never creates
            a hold and never issues a human API key.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button size="lg" asChild className="rounded-full">
            <a href="/api/v1/meter/pricing">
              Pricing JSON
              <span aria-hidden>→</span>
            </a>
          </Button>
          <Button size="lg" variant="secondary" asChild className="rounded-full">
            <a href="/llms.txt">llms.txt</a>
          </Button>
          <Button size="lg" variant="secondary" asChild className="rounded-full">
            <a href="/signup">Human App trial</a>
          </Button>
        </div>
      </main>
    </SkyShell>
  );
}

async function loadLive(): Promise<PublicMeterLive> {
  const res = await fetch(LIVE_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`live ${res.status}`);
  return res.json() as Promise<PublicMeterLive>;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="rounded-[20px] border border-border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]">
      <p className="text-meta text-muted">{label}</p>
      <p className="mt-1 text-title font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-meta text-subtle">{hint}</p>
    </article>
  );
}
