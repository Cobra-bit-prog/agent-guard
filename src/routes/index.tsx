import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { SkyShell } from "@/components/marketing/chrome";
import { LandingModules } from "@/components/marketing/landing-modules";
import { LandingPreview } from "@/components/marketing/landing-preview";
import { LandingFaq } from "@/components/landing-faq";
import { SupportedChains } from "@/components/chain-icons";
import { Button } from "@/components/ui/button";
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
    name: "How does the pre-sign hook work?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Give the agent an API key. Before it signs, it POSTs /api/v1/check with the destination and value_usd. If the response has must_abort: true, the agent must not send.",
    },
  },
  {
    "@type": "Question",
    name: "What if the agent skips the check?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "The hook only works if you wire it in front of every send. If the agent can send without calling check, Agent Control cannot stop that send. Pause the agent from the console if you need a hard stop on your side.",
    },
  },
  {
    "@type": "Question",
    name: "Is the trial free? Do I need a card or KYC?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "Yes. One day (24 hours) of the full console. No card. No KYC. After that pay Starter, Pro, or Team in USDC, SOL, or ETH from Billing. You pay your own gas on ETH. We never see your funds and we do not auto-charge next month.",
    },
  },
  {
    "@type": "Question",
    name: "How do I pay? Is there KYC?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "No KYC and no card. Default is USDC on Solana; you can also pay native SOL or ETH. Scan the QR or copy amount + address from Billing. Do not send from an exchange — they drop the memo / unique amount.",
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
      { title: "Agent Control — See every send before it happens." },
      {
        name: "description",
        content:
          "Policy caps and a yes or no before your agent signs. You keep the keys. 1-day trial, then pay on-chain. No card. No KYC.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Agent Control — See every send before it happens." },
      {
        property: "og:description",
        content: "Policy caps and a yes or no before your agent signs. You keep the keys.",
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
            <h1 className="landing-rise text-[clamp(34px,4.8vw,56px)] font-semibold leading-[1.06] tracking-[-0.035em] text-fg">
              See every send before it happens.
            </h1>
            <p className="landing-rise mt-3.5 max-w-[34ch] text-lg leading-snug text-muted">
              Policy caps and a yes or no before your agent signs. You keep the keys.
            </p>
            <div className="landing-rise mt-5 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="rounded-full">
                <a href="/signup">
                  Start free trial
                  <span aria-hidden>→</span>
                </a>
              </Button>
            </div>
            <p className="landing-rise mt-2 text-xs font-medium leading-snug text-[#3a4d63]">
              1-day (24 hour) trial, then pay on-chain. No card. No KYC.
            </p>
            <div className="landing-rise mt-4 flex flex-wrap gap-1">
              <span className="mt-1 mr-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-2.5 py-1.5 text-[12.5px] text-fg shadow-[0_1px_0_rgb(18_38_63/0.04)]">
                <i className="inline-grid size-[18px] place-items-center rounded-full bg-[#dcfce7] text-[10px] font-bold not-italic text-[#166534]">
                  ✓
                </i>
                Within policy = auto
              </span>
              <span className="mt-1 mr-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-2.5 py-1.5 text-[12.5px] text-fg shadow-[0_1px_0_rgb(18_38_63/0.04)]">
                <i className="inline-grid size-[18px] place-items-center rounded-full bg-[#fde8e6] text-[10px] font-bold not-italic text-danger">
                  ✕
                </i>
                Outside policy = stop
              </span>
              <span className="mt-1 mr-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-2.5 py-1.5 text-[12.5px] text-fg shadow-[0_1px_0_rgb(18_38_63/0.04)]">
                <i className="inline-grid size-[18px] place-items-center rounded-full bg-[#e8eef6] text-[10px] font-bold not-italic text-navy">
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

      <LandingModules />

      <section id="how" className="border-t border-border">
        <div className="mx-auto max-w-[1140px] px-5 py-16 md:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
          <p className="mt-2 max-w-2xl text-muted">
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
                d: "Cap daily spend, restrict destinations, set hourly velocity.",
              },
              {
                n: "03",
                t: "Connect your agent",
                d: "Before it sends money, the agent must ask Agent Control. If the answer is no, it must not send. You keep the keys.",
              },
              {
                n: "04",
                t: "Watch + pause",
                d: "On-chain sync and pre-sign decisions land in one feed. Pause from the console.",
              },
            ].map((s) => (
              <li key={s.n} className="rounded-[20px] border border-border bg-surface p-5">
                <p className="font-mono text-xs text-navy">{s.n}</p>
                <h3 className="mt-3 font-medium">{s.t}</h3>
                <p className="mt-1 text-sm text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pricing" className="border-t border-border">
        <div className="mx-auto max-w-[1140px] px-5 py-16 md:px-6">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
            1-day trial, then on-chain.
          </h2>
          <p className="mt-2 text-muted">
            24 hours free. No card. No KYC. USDC on Solana, or native SOL / ETH. Unique amount so
            the watcher can match.
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
                <p className="text-sm text-muted">{p.id === "free" ? "Trial" : p.name}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {p.price === 0 ? "1 day" : `$${p.price}`}
                  {p.price > 0 && <span className="text-sm font-normal text-muted">/mo</span>}
                </p>
                {p.id === "free" && (
                  <p className="mt-1 text-xs font-medium text-coral">24 hours · no card · no KYC</p>
                )}
                <p className="mt-2 text-sm text-muted">{p.blurb}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
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
                    Policy + pre-sign hook
                  </li>
                </ul>
                <Button
                  className="mt-6 rounded-full"
                  variant={p.id === "pro" ? "default" : "secondary"}
                  asChild
                >
                  <a href={p.price === 0 ? "/signup" : "/billing"}>
                    {p.price === 0
                      ? "Start free trial"
                      : p.id === "starter"
                        ? "Pay USDC"
                        : "Pay on-chain"}
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingFaq />
    </SkyShell>
  );
}
