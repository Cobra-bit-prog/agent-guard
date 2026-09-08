import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { SkyShell } from "@/components/marketing/chrome";
import { LandingCatch } from "@/components/marketing/landing-catch";
import { LandingGate } from "@/components/marketing/landing-gate";
import { LandingProductTabs } from "@/components/marketing/landing-modules";
import { LandingPreview } from "@/components/marketing/landing-preview";
import { LandingVerdict } from "@/components/marketing/landing-verdict";
import { LandingFaq } from "@/components/landing-faq";
import { ConnectCtas, ConnectSteps } from "@/components/marketing/connect-path";
import { SupportedChains } from "@/components/chain-icons";
import { Button } from "@/components/ui/button";
import {
  CONNECT_EYEBROW,
  CONNECT_FAQ_ANSWER,
  CONNECT_FAQ_DOCS_HREF,
  CONNECT_HEADLINE,
  CONNECT_LEDE,
  CONNECT_PAGE_LINK_LABEL,
  CONNECT_STARTER_LINE,
} from "@/lib/connect-path";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

const HOME_FAQ_LD = [
  {
    "@type": "Question",
    name: "Do you hold my keys?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "No. We are not a custodian. You keep the keys. Agent Control scores a send against your policy and answers a check the agent must call before it spends.",
    },
  },
  {
    "@type": "Question",
    name: "Why didn’t I get an email when I signed up?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "You must confirm your email before the dashboard. After signup we keep you on a waiting screen until you click the link (one hour). If nothing arrives, check spam, then resend from that screen. Sign-in of an unconfirmed account sends a new link and returns you there.",
    },
  },
  {
    "@type": "Question",
    name: "Which chains are supported?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Solana, Ethereum, and Base. Live wallets sync native balance and recent transfers. Demo wallets stay labeled so you can tour the console first.",
    },
  },
  {
    "@type": "Question",
    name: "How do I connect my agent?",
    acceptedAnswer: {
      "@type": "Answer",
      text: `${CONNECT_FAQ_ANSWER} See https://agent-control.net${CONNECT_FAQ_DOCS_HREF} for how to plug it in.`,
    },
  },
  {
    "@type": "Question",
    name: "What if the agent skips the check?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Connect your agent so it asks before every send. You keep the keys. If the agent skips the check, Inbox cannot stop that send. Pause the agent from the console for a hard stop on your side. Over-limit or new addresses wait for you; block means do not send.",
    },
  },
  {
    "@type": "Question",
    name: "What is Approval Inbox?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "New or over-limit payments wait in Approval Inbox. Allow once, always allow that address, or block. No action for 10 minutes = block. Pause and blocklists stop the send right away.",
    },
  },
  {
    "@type": "Question",
    name: "What is Agent Audit?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "On-demand Excel, PDF, or CSV in /audit. Generate when you want it — nothing is auto-emailed. This is the Agent Control check and decision trail, not a full chain explorer or a replay of every on-chain transfer.",
    },
  },
  {
    "@type": "Question",
    name: "Is this a package scanner?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "No. Agent Control is spend control for agent wallets — Approval Inbox and spend limits you set. Not a package scanner.",
    },
  },
  {
    "@type": "Question",
    name: "Do you email me when something looks off?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "If Email alerts is on in Settings (on by default), we send optional pings for a policy alert, spend near the daily cap, a payment waiting in Approval Inbox (/inbox), or a hard block. When a payment is waiting for you, that email (and Slack, if you saved an incoming webhook URL in Settings) includes a link to Approval Inbox. No action within 10 minutes = block — the agent must abort. Console alerts still list at /alerts. Turn Email alerts off to keep policy pings in the console only. If the agent skips the check, Inbox cannot stop that send.",
    },
  },
  {
    "@type": "Question",
    name: "Do you host this, or do I run it myself?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "We host Approval Inbox and Agent Audit. You keep the keys. They ask before they pay. Within policy = auto · Outside policy = stop. Not a package scanner.",
    },
  },
  {
    "@type": "Question",
    name: "Is the trial free? Do I need a card or KYC?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Yes. One day (24 hours) of the full console. No card. No KYC. After that pay Starter $29, Pro $49, or Team $149 in USDC on Solana. We never see your funds and we do not auto-charge next month.",
    },
  },
  {
    "@type": "Question",
    name: "How do I pay? Is there KYC?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "No KYC and no card. Default is $29 USDC on Solana. Scan or tap Pay. We unlock when it lands. Use a wallet. Do not send from Coinbase or Binance.",
    },
  },
  {
    "@type": "Question",
    name: "Is this insurance?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "No. Monitoring and policy checks only. A blocked check is a decision, not a guarantee that funds cannot move.",
    },
  },
  {
    "@type": "Question",
    name: "How do I reach support?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Problems or billing questions: email support@agent-control.net.",
    },
  },
] as const;

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      mainEntity: HOME_FAQ_LD,
    },
    {
      "@type": "SoftwareApplication",
      name: "Agent Control",
      url: "https://agent-control.net",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      sameAs: ["https://github.com/Cobra-bit-prog/agent-guard"],
      description:
        "External audit for your agents. Agent payments control with spend limits, Dashboard, Agent Audit, and Approval Inbox. You keep the keys.",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "0",
        highPrice: "149",
        priceCurrency: "USD",
        description: "1-day (24 hour) free trial then 29/49/149 USDC, SOL, or ETH",
      },
    },
  ],
};

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "External audit for your agents — Agent Control" },
      {
        name: "description",
        content:
          "External audit for your agents. Agent payments control with spend limits, Dashboard, Agent Audit, and Approval Inbox. You keep the keys. 1-day trial. No card. No KYC.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "External audit for your agents — Agent Control" },
      {
        property: "og:description",
        content:
          "External audit for your agents. Agent payments control with spend limits, Dashboard, Agent Audit, and Approval Inbox. You keep the keys.",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(HOME_JSON_LD),
      },
    ],
  }),
});

function Home() {
  return (
    <SkyShell current="home">
      <section className="landing-hero mx-auto max-w-[1140px] px-5 pb-7 pt-6 md:px-6">
        <div className="grid items-center gap-8 lg:grid-cols-[1.14fr_0.96fr]">
          <div>
            <h1 className="landing-rise text-display font-semibold text-balance text-fg">
              External audit for your agents
            </h1>
            <p className="landing-rise mt-3 max-w-[44ch] text-body font-medium leading-snug text-navy">
              Not a package scanner — this is spend control for agent wallets.
            </p>
            <p className="landing-rise mt-3 max-w-[44ch] text-card leading-snug text-muted">
              Keep control of your agents’ spending. You set the limits. Suspicious transactions
              show up as alerts.
            </p>
            <p className="landing-rise mt-2.5 max-w-[44ch] text-body leading-snug text-muted">
              Agent payments control — spend limits you set, and you keep the keys.
            </p>
            <div className="landing-rise mt-5 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="rounded-full">
                <a href="/signup">
                  Start free trial
                  <span aria-hidden>→</span>
                </a>
              </Button>
            </div>
            <p className="landing-rise mt-2 text-meta font-medium leading-snug text-muted">
              1-day (24 hour) trial, then pay on-chain. No card. No KYC.
            </p>
            <div className="landing-rise mt-4 flex flex-wrap gap-1">
              <span className="mt-1 mr-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-2.5 py-1.5 text-meta text-fg shadow-[0_1px_0_rgb(18_38_63/0.04)]">
                <i className="inline-grid size-5 place-items-center rounded-full bg-[#dcfce7] text-meta font-bold not-italic leading-none text-[#166534]">
                  ✓
                </i>
                Within policy = auto
              </span>
              <span className="mt-1 mr-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-2.5 py-1.5 text-meta text-fg shadow-[0_1px_0_rgb(18_38_63/0.04)]">
                <i className="inline-grid size-5 place-items-center rounded-full bg-[#fde8e6] text-meta font-bold not-italic leading-none text-danger">
                  ✕
                </i>
                Outside policy = stop
              </span>
              <span className="mt-1 mr-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-2.5 py-1.5 text-meta text-fg shadow-[0_1px_0_rgb(18_38_63/0.04)]">
                <i className="inline-grid size-5 place-items-center rounded-full bg-[#e8eef6] text-meta font-bold not-italic leading-none text-navy">
                  🔑
                </i>
                Keys stay with you
              </span>
            </div>
            <SupportedChains className="landing-rise mt-5" />
          </div>
          <div className="min-w-0">
            <LandingPreview />
          </div>
        </div>
      </section>

      <LandingVerdict />

      <LandingProductTabs />

      <LandingCatch />

      <section id="how" className="border-t border-border">
        <div className="mx-auto max-w-[1140px] px-5 py-16 md:px-6">
          <h2 className="text-title font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-2xl text-body text-muted">
            Four steps. No custody. The agent has to ask before it sends.
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              {
                n: "01",
                t: "Enroll a wallet",
                d: "Paste a live address. We pull native balance and recent transfers.",
              },
              {
                n: "02",
                t: "Set policy",
                d: "Cap daily spend, restrict destinations, limit how fast they can spend.",
              },
              {
                n: "03",
                t: "Connect your agent",
                d: "Give it an API key. They ask before they pay. You keep the keys.",
              },
              {
                n: "04",
                t: "Watch + pause",
                d: "On-chain sync and alerts land in one feed. Pause from the console.",
              },
            ].map((s) => (
              <li key={s.n} className="rounded-[20px] border border-border bg-surface p-5">
                <p className="font-mono text-meta text-navy">{s.n}</p>
                <h3 className="mt-3 text-card font-medium">{s.t}</h3>
                <p className="mt-1 text-body text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="connect" className="border-t border-border">
        <div className="mx-auto max-w-[1140px] px-5 py-16 md:px-6">
          <p className="text-meta font-medium uppercase tracking-[0.18em] text-coral">
            {CONNECT_EYEBROW}
          </p>
          <h2 className="mt-3 text-title font-semibold tracking-tight">
            {CONNECT_HEADLINE}
          </h2>
          <p className="mt-2 max-w-2xl text-body text-muted">{CONNECT_LEDE}</p>
          <p className="mt-2 max-w-2xl text-body text-fg">{CONNECT_STARTER_LINE}</p>
          <ConnectSteps />
          <div className="mt-8">
            <ConnectCtas />
          </div>
          <p className="mt-3 text-body text-muted">
            Works with AgentKit, x402, or MCP — popular agent payment tools.{" "}
            <a href="/connect" className="font-medium text-navy hover:text-coral">
              {CONNECT_PAGE_LINK_LABEL}
            </a>
          </p>
        </div>
      </section>

      <section id="pricing" className="border-t border-border">
        <div className="mx-auto max-w-[1140px] px-5 py-16 md:px-6">
          <h2 className="text-title font-semibold tracking-tight">
            1-day trial, then on-chain.
          </h2>
          <p className="mt-2 text-body text-muted">
            24 hours free. No card. No KYC. Default is $29 USDC on Solana. Scan or tap Pay. We
            unlock when it lands.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Object.values(PLANS).map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex flex-col rounded-[20px] border bg-surface p-5 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)]",
                  p.id === "pro" ? "border-coral/50" : "border-border",
                )}
              >
                <p className="text-body text-muted">{p.id === "free" ? "Trial" : p.name}</p>
                <p className="mt-3 text-title font-semibold tracking-tight">
                  {p.price === 0 ? "1 day" : `$${p.price}`}
                  {p.price > 0 && <span className="text-body font-normal text-muted">/mo</span>}
                </p>
                {p.id === "free" && (
                  <p className="mt-1 text-meta font-medium text-coral">24 hours · no card · no KYC</p>
                )}
                <p className="mt-2 text-body text-muted">{p.blurb}</p>
                <ul className="mt-4 flex-1 space-y-2 text-body text-muted">
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" />
                    {p.agents} agent wallets
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" />
                    <span className="whitespace-nowrap">{`${p.historyDays}-day history`}</span>
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-success" />
                    They ask before they pay
                  </li>
                </ul>
                <Button
                  className="mt-6 rounded-full"
                  variant={p.id === "pro" ? "default" : "secondary"}
                  asChild
                >
                  <a href={p.price === 0 ? "/signup" : `/billing/pay?plan=${p.id}`}>
                    {p.price === 0
                      ? "Start free trial"
                      : `Pay $${p.price}`}
                  </a>
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-body text-muted">
            External audit for your agents — you keep the keys.
          </p>
        </div>
      </section>

      <LandingGate />

      <LandingFaq />
    </SkyShell>
  );
}
