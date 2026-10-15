/**
 * Turn a decoded x402 402 into a directory listing the existing POST will accept.
 * Limits match parseListing. This file stays free of Node APIs so the check page can reuse the pitch.
 */

import { LISTINGS_URL } from "../directory/self-list.ts";
import { BASE_USDC } from "../meter/accepts.ts";
import { USDC_MINT } from "../solana-pay.ts";

/** Same caps as parseListing in the directory. */
const NAME_MAX = 80;
const SKILL_MAX = 32;
const SKILLS_MAX = 8;
const PITCH_MAX = 280;
const CONTACT_MAX = 200;
const LINK_MAX = 500;

const FALLBACK_NAME = "x402 endpoint";
const FALLBACK_DESCRIPTION = "Paid x402 endpoint.";
const FALLBACK_SKILL = "x402";
const USDC_DECIMALS = 6;

/**
 * Circle USDC contracts with 6 decimals.
 * EVM addresses are compared case-insensitively. Solana mints stay case-sensitive.
 */
const EVM_USDC_ASSETS = new Set(
  [
    BASE_USDC, // Base
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
    "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // Avalanche
    "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", // Celo
  ].map((asset) => asset.toLowerCase()),
);

const SOLANA_USDC_ASSETS = new Set([
  USDC_MINT, // Solana
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Solana devnet
]);

export const ALREADY_LISTED_LINE = "This endpoint is already listed.";

export type X402ListingExisting = {
  id: string;
  name: string;
  href: string;
  line: string;
};

/** Prefill for the check page and for POST /api/v1/agents/listings. */
export type X402ListingPrefill = {
  name: string;
  description: string;
  price: string | null;
  network: string | null;
  pay_to: string | null;
  endpoint_url: string | null;
  skills: string[];
  contact: string;
  post: string;
  body: {
    name: string;
    skills: string[];
    pitch: string;
    contact: string;
    link: string | null;
  };
  existing: X402ListingExisting | null;
};

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Bag;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpsUrl(value: string, max: number): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !url.hostname) return null;
    if (url.href.length > max) return null;
    return url.href;
  } catch {
    return null;
  }
}

function hostName(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function resourceOf(payment: Bag): Bag | null {
  return bag(payment.resource);
}

function bazaarOf(payment: Bag): Bag | null {
  return bag(bag(payment.extensions)?.bazaar);
}

function firstText(values: unknown[]): string {
  for (const value of values) {
    const trimmed = text(value);
    if (trimmed) return trimmed;
  }
  return "";
}

function tagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const skills: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const skill = clip(item.replace(/,/g, " ").replace(/\s+/g, " "), SKILL_MAX);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
    if (skills.length >= SKILLS_MAX) break;
  }
  return skills;
}

function acceptsOf(payment: Bag): Bag[] {
  const accepts = payment.accepts;
  if (!Array.isArray(accepts)) return [];
  return accepts.filter((item): item is Bag => Boolean(bag(item)));
}

function knownUsdcAsset(asset: string): boolean {
  if (!asset) return false;
  if (/^0x/i.test(asset)) return EVM_USDC_ASSETS.has(asset.toLowerCase());
  return SOLANA_USDC_ASSETS.has(asset);
}

/** extra.name on an x402 requirement, when the server names the token but omits decimals. */
function namedUsdc(extra: Bag | null): boolean {
  const name = text(extra?.name).toLowerCase();
  return name === "usdc" || name === "usd coin";
}

function decimalsOf(accept: Bag): number | null {
  const extra = bag(accept.extra);
  const raw = extra?.decimals;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 18) return raw;
  if (typeof raw === "string" && /^\d{1,2}$/.test(raw)) {
    const parsed = Number(raw);
    if (parsed <= 18) return parsed;
  }
  if (knownUsdcAsset(text(accept.asset))) return USDC_DECIMALS;
  if (namedUsdc(extra)) return USDC_DECIMALS;
  if (text(extra?.symbol).toUpperCase() === "USDC") return USDC_DECIMALS;
  return null;
}

function formatTokenAmount(amount: string, decimals: number): string | null {
  if (!/^\d{1,40}$/.test(amount)) return null;
  const value = BigInt(amount);
  if (decimals === 0) return value.toString();
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const frac = value % scale;
  if (frac === 0n) return whole.toString();
  const fracText = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracText}`;
}

function priceOf(accepts: Bag[]): string | null {
  for (const accept of accepts) {
    const raw = text(accept.amount) || text(accept.maxAmountRequired);
    if (!raw) continue;
    const decimals = decimalsOf(accept);
    // An unresolved token must not surface its atomic amount as a dollar price.
    if (decimals == null) return null;
    return formatTokenAmount(raw, decimals);
  }
  return null;
}

function networkOf(accepts: Bag[]): string | null {
  for (const accept of accepts) {
    const network = clip(text(accept.network), 80);
    if (network) return network;
  }
  return null;
}

function payToOf(accepts: Bag[]): string | null {
  for (const accept of accepts) {
    const payTo = clip(text(accept.payTo), 200);
    if (payTo) return payTo;
  }
  return null;
}

export function composeListingPitch(input: {
  description: string;
  price: string | null;
  network: string | null;
  pay_to: string | null;
}): string {
  const description = clip(input.description, PITCH_MAX);
  const price = input.price?.trim() ?? "";
  const network = input.network?.trim() ?? "";
  const payTo = input.pay_to?.trim() ?? "";
  const cost = [price ? `$${price} USDC` : "", network ? `on ${network}` : ""]
    .filter(Boolean)
    .join(" ");
  const suffix = [cost, payTo ? `Pay ${payTo}.` : ""].filter(Boolean).join(". ");
  const base = description || (suffix ? "" : FALLBACK_DESCRIPTION);
  if (!suffix) return base;
  if (!base) return clip(suffix, PITCH_MAX);
  const gap = /[.!?]$/.test(base) ? " " : ". ";
  const combined = `${base}${gap}${suffix}`;
  if (combined.length <= PITCH_MAX) return combined;
  return base;
}

/**
 * Build the prefill from a decoded payment object.
 * Returns null when there is no payment object to read.
 */
export function listingDraftFromPayment(
  payment: unknown,
  requestedUrl: string | null,
): X402ListingPrefill | null {
  const root = bag(payment);
  if (!root) return null;

  const resource = resourceOf(root);
  const bazaar = bazaarOf(root);
  const info = bag(bazaar?.info);
  const accepts = acceptsOf(root);

  const endpoint =
    httpsUrl(text(resource?.url), LINK_MAX) ??
    (requestedUrl ? httpsUrl(requestedUrl, LINK_MAX) : null);
  const contact =
    (endpoint ? httpsUrl(endpoint, CONTACT_MAX) : null) ??
    (endpoint ? httpsUrl(new URL(endpoint).origin, CONTACT_MAX) : null) ??
    "";
  const name = clip(
    firstText([info?.name, bazaar?.name, resource?.serviceName]) ||
      (endpoint ? hostName(endpoint) : "") ||
      FALLBACK_NAME,
    NAME_MAX,
  );
  const described = firstText([info?.description, bazaar?.description, resource?.description]);
  const description = clip(described || FALLBACK_DESCRIPTION, PITCH_MAX);
  const skills = tagList(info?.tags ?? bazaar?.tags ?? resource?.tags);
  const price = priceOf(accepts);
  const network = networkOf(accepts);
  const payTo = payToOf(accepts);
  const pitch = composeListingPitch({
    description,
    price,
    network,
    pay_to: payTo,
  });

  return {
    name,
    description,
    price,
    network,
    pay_to: payTo,
    endpoint_url: endpoint,
    skills: skills.length ? skills : [FALLBACK_SKILL],
    contact,
    post: LISTINGS_URL,
    body: {
      name,
      skills: skills.length ? skills : [FALLBACK_SKILL],
      pitch,
      contact,
      link: endpoint,
    },
    existing: null,
  };
}
