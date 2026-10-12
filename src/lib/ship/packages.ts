/**
 * Ship to paid. Two fixed packages, paid in USDC on Solana or Base.
 * Requests land in hire_orders with these package ids. Nothing is charged
 * from the form. We reply with a USDC payment link.
 * Do not promise sales, or a listing by Coinbase.
 */

import { formatHirePrice } from "../hire/packages.ts";

export const SHIP_SUPPORT_EMAIL = "support@agent-control.net";
export const SHIP_PATH = "/ship";
export const SHIP_API_PATH = "/api/v1/ship";
export const SHIP_PAGE_URL = "https://agent-control.net/ship";

export const SHIP_PAY_LINE = "Paid in USDC on Solana or Base.";
export const SHIP_CHARGE_LINE = "Nothing is charged from this form.";
export const SHIP_REPLY_LINE = "We'll reply within 1 business day with a USDC payment link.";
export const SHIP_REFUND_LINE = "If the work isn't delivered, we refund in USDC.";
export const SHIP_HONESTY_LINE =
  "We do not promise sales. We do not promise a listing by Coinbase.";

export const SHIP_PACKAGE_IDS = ["fix", "launch"] as const;

export type ShipPackageId = (typeof SHIP_PACKAGE_IDS)[number];

export type ShipPackage = {
  id: ShipPackageId;
  name: string;
  priceUsd: number;
  days: number;
  included: string;
  excluded: string;
};

export const SHIP_PACKAGES: readonly ShipPackage[] = [
  {
    id: "fix",
    name: "Fix",
    priceUsd: 149,
    days: 3,
    included:
      "We get an existing x402 or MCP paid endpoint returning a valid 402, passing Coinbase's x402 validator, and listed so it can be discovered. Delivered within 3 business days.",
    excluded: `${SHIP_HONESTY_LINE} This is the technical fix only.`,
  },
  {
    id: "launch",
    name: "Launch",
    priceUsd: 399,
    days: 5,
    included:
      "We take one API or tool live as a paid x402 endpoint, with a listing. Delivered within 5 business days.",
    excluded: `${SHIP_HONESTY_LINE} One API or one tool.`,
  },
];

const BY_ID = new Map(SHIP_PACKAGES.map((pack) => [pack.id, pack]));

export function shipPackage(id: string): ShipPackage | undefined {
  return BY_ID.get(id as ShipPackageId);
}

export function isShipPackageId(id: string): id is ShipPackageId {
  return BY_ID.has(id as ShipPackageId);
}

export function formatShipPrice(usd: number): string {
  return formatHirePrice(usd);
}

/** Plain-text block for skill.md. Prices stay tied to SHIP_PACKAGES. */
export const SHIP_SKILL_SECTION = `
## 8. Ship to paid

We get a paid endpoint ready, or we take one API or tool live.
Page: ${SHIP_PAGE_URL}
${SHIP_PAY_LINE} Send the endpoint URL, the package, and an email. A note is optional. ${SHIP_CHARGE_LINE} ${SHIP_REPLY_LINE} ${SHIP_REFUND_LINE}
${SHIP_PACKAGES.map((pack) => `- ${pack.name} — ${formatShipPrice(pack.priceUsd)} — ${pack.included}`).join("\n")}
${SHIP_HONESTY_LINE}
The ship API stays closed to crawlers.
`;
