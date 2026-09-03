import { useState } from "react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "Do you hold my keys?",
    a: "No. We are not a custodian. You keep the keys. Agent Control scores a send against your policy and answers a check the agent must call before it spends.",
  },
  {
    q: "Why didn’t I get an email when I signed up?",
    a: "You must confirm your email before the dashboard. After signup we keep you on a waiting screen until you click the link (one hour). If nothing arrives, check spam, then resend from that screen. Sign-in of an unconfirmed account sends a new link and returns you there.",
  },
  {
    q: "Which chains are supported?",
    a: "Solana, Ethereum, and Base. Live wallets sync native balance and recent transfers. Demo wallets stay labeled so you can tour the console first.",
  },
  {
    q: "How does the pre-sign hook work?",
    a: "Give the agent an API key. Before it signs, it POSTs /api/v1/check with the destination and value_usd. If the response has must_abort: true, do not send. Off-policy and first-time destinations can HOLD with a poll_url — you decide in /inbox. Pause and denylist are a hard block (never a hold).",
  },
  {
    q: "What if the agent skips the check?",
    a: "Connect your agent so it asks before every send. You keep the keys. If the agent skips the check, Inbox cannot stop that send. Pause the agent from the console for a hard stop on your side. Hold waits for you; block means do not send.",
  },
  {
    q: "What is Approval Inbox?",
    a: "Off-policy and first-time destinations wait in /inbox. Allow once for this send only, Always allow this address to write the allowlist, or Block. Holds expire in 10 minutes and are then treated as a block. Allow once is not permanent. Pause and denylist never wait here — they are a hard block.",
  },
  {
    q: "What is Agent Audit?",
    a: "On-demand Excel and PDF in /audit. Generate when you want it — nothing is auto-emailed. This is the Agent Control check and decision trail, not a full chain explorer or ghost replay.",
  },
  {
    q: "Do you email me when something looks off?",
    a: "If Email alerts is on in Settings (on by default), we send optional pings for a policy alert, spend near the daily cap, a hold waiting in Inbox (/inbox), or a hard block. When a spend is held, that email (and Slack, if you saved an incoming webhook URL in Settings) includes a link to Approval Inbox. No action within 10 minutes = block — the agent must abort. Console alerts still list at /alerts. Turn Email alerts off to keep policy pings in the console only. If the agent skips the check, Inbox cannot stop that send.",
  },
  {
    q: "How is this different from agentaudit.dev, SpendGuard, or Turnkey?",
    a: (
      <>
        Agent Control is agent payments control for agent wallets — spend limits, approval before
        agent send, hold vs block. Not a package scanner. SpendGuard (x402-spendguard) is a firewall
        you run yourself. We are hosted Approval Inbox and Agent Audit. You keep the keys.{" "}
        <a href="/docs#compare" className="text-fg underline underline-offset-4">
          Compare on docs
        </a>
        .
      </>
    ),
  },
  {
    q: "Is the trial free? Do I need a card or KYC?",
    a: "Yes. One day (24 hours) of the full console. No card. No KYC. After that pay Starter, Pro, or Team in USDC, SOL, or ETH from Billing. You pay your own gas on ETH. We never see your funds and we do not auto-charge next month.",
  },
  {
    q: "How do I pay? Is there KYC?",
    a: "No KYC and no card. Default is USDC on Solana; you can also pay native SOL or ETH. Scan the QR or copy amount + address from Billing. Do not send from an exchange — they drop the memo / unique amount.",
  },
  {
    q: "Is this insurance?",
    a: "No. Monitoring and policy checks only. A blocked check is a decision, not a guarantee that funds cannot move.",
  },
  {
    q: "How do I reach support?",
    a: (
      <>
        Problems or billing questions: email{" "}
        <a href="mailto:support@agent-control.net" className="text-fg underline underline-offset-4">
          support@agent-control.net
        </a>
        .
      </>
    ),
  },
];

export function LandingFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-border">
      <div className="mx-auto max-w-3xl px-6 py-16 md:px-10">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Questions operators ask
        </h2>
        <p className="mt-2 text-muted">
          Straight answers. Custody, Inbox, Audit, warning emails, compare, billing, and the signup
          email.
        </p>
        <div className="faq mt-8 divide-y divide-border rounded-[22px] border border-border bg-surface">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span className="font-medium">{item.q}</span>
                  <span className="mt-0.5 text-muted">{isOpen ? "–" : "+"}</span>
                </button>
                <div className={cn("px-5 pb-4 text-sm text-muted", !isOpen && "hidden")}>
                  {item.a}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
