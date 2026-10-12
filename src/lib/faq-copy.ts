/**
 * Public /faq copy. Starts from the old homepage FAQ (keys, the free day,
 * paying in USDC, support) and names the pages that exist today.
 * Plain words. No payment promises the product does not make.
 */
import { AGENT_CHECK_DAYS, AGENT_CHECK_PRICE_USD, FREE_CHECK_IDS } from "./agent-check/copy.ts";
import { FEATURED_DAYS, FEATURED_PRICE_USD } from "./directory/featured-copy.ts";
import { formatHirePrice, HIRE_PACKAGES } from "./hire/packages.ts";
import { SUPPORT_EMAIL } from "./oauth/copy.ts";
import { PLANS } from "./plans.ts";
import { PERIOD_DAYS } from "./solana-pay.ts";
import { X402_CHECK_DAYS, X402_CHECK_PRICE_USD } from "./x402-check/copy.ts";

export const FAQ_SUPPORT_EMAIL = SUPPORT_EMAIL;

export const FAQ_EYEBROW = "FAQ";
export const FAQ_HEADLINE = "Questions, answered";
export const FAQ_LEDE = "Short answers. You keep the keys. This is not insurance.";
export const FAQ_PAGE_TITLE = "FAQ — Agent Control";
export const FAQ_PAGE_DESCRIPTION =
  "How to pay at /billing, list an agent for free, pin a listing, hire us, and run the two checks. Email support@agent-control.net.";

export type FaqLink = { href: string; label: string };
export type FaqPart = string | FaqLink;

export type FaqItem = {
  q: string;
  parts: readonly FaqPart[];
};

function dollars(amount: number): string {
  return `$${amount}`;
}

const hirePrices = HIRE_PACKAGES.map(
  (pack) => `${pack.name} is ${formatHirePrice(pack.priceUsd)}`,
).join(". ");

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: "How do I pay for the console?",
    parts: [
      "Sign in, then open ",
      { href: "/billing", label: "/billing" },
      `. You pay USDC on Solana or Base. Solana is the one on the pay screen. Starter is ${dollars(PLANS.starter.price)}, Pro is ${dollars(PLANS.pro.price)}, and Team is ${dollars(PLANS.team.price)}, each for ${PERIOD_DAYS} days. The first day is free. No card. It does not charge you again by itself. You keep the keys. Use a wallet. Do not send from Coinbase or Binance.`,
    ],
  },
  {
    q: "How do I list an agent for free?",
    parts: [
      "Listing is free. Open ",
      { href: "/directory", label: "/directory" },
      " and leave a name, what the agent can do, a short pitch, and a contact. People reach you at that contact. To have the agent add itself, open ",
      { href: "/list-agent", label: "/list-agent" },
      " and give it that page. No account.",
    ],
  },
  {
    q: "What is a Featured listing?",
    parts: [
      `Featured is ${dollars(FEATURED_PRICE_USD)} for ${FEATURED_DAYS} days. It pins your agent at the top of `,
      { href: "/directory", label: "/directory" },
      ". You pay us directly in USDC on Solana or Base. We keep the fee. The free listing does not charge.",
    ],
  },
  {
    q: "What is Hire us?",
    parts: [
      { href: "/hire", label: "/hire" },
      ` is fixed work we do for you. ${hirePrices}. After you pay, our team does that package. This is not the free job board. Listing an agent and posting a job stay free.`,
    ],
  },
  {
    q: "What are the two checks?",
    parts: [
      "The check at ",
      { href: "/x402-check", label: "/x402-check" },
      ` looks at why a seller may be missing from Coinbase's Bazaar. The opening checks are free. The full report is ${dollars(X402_CHECK_PRICE_USD)}, with one free re-check within ${X402_CHECK_DAYS} days. A pass does not mean Coinbase will list you. The check at `,
      { href: "/agent-check", label: "/agent-check" },
      ` looks at whether an agent can find and use your site. The first ${FREE_CHECK_IDS.length} checks are free. The full report is ${dollars(AGENT_CHECK_PRICE_USD)}, with one free re-check within ${AGENT_CHECK_DAYS} days. A pass does not mean an agent will use the site. You pay us directly in USDC on Solana or Base. We keep the fee.`,
    ],
  },
  {
    q: "How do I reach you?",
    parts: [
      "Email ",
      { href: `mailto:${FAQ_SUPPORT_EMAIL}`, label: FAQ_SUPPORT_EMAIL },
      ".",
    ],
  },
];

export function faqPlainText(items: readonly FaqItem[] = FAQ_ITEMS): string {
  const chunks = [FAQ_LEDE, FAQ_PAGE_DESCRIPTION];
  for (const item of items) {
    chunks.push(item.q);
    for (const part of item.parts) {
      chunks.push(typeof part === "string" ? part : `${part.label} ${part.href}`);
    }
  }
  return chunks.join("\n");
}
