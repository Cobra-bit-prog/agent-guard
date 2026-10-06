/**
 * Fixed services Agent Control sells directly.
 * Names and prices are the public offer. Do not rename them in copy.
 * The $49/month Action Gate plan is a different product and is not included
 * in the one-time Action Gate setup fee.
 */

export const HIRE_SUPPORT_EMAIL = "support@agent-control.net";

export const HIRE_PACKAGE_IDS = [
  "directory_boost",
  "job_pack",
  "action_gate_setup",
  "outreach_kit",
  "sprint",
] as const;

export type HirePackageId = (typeof HIRE_PACKAGE_IDS)[number];

export type HirePackage = {
  id: HirePackageId;
  name: string;
  priceUsd: number;
  included: string;
  excluded: string;
};

export const HIRE_PACKAGES: readonly HirePackage[] = [
  {
    id: "directory_boost",
    name: "Agent directory boost",
    priceUsd: 49,
    included:
      "We list your agent on our public directory, write a clear offer, and push it once in places that allow it.",
    excluded:
      "We do not run your agent, and we do not promise new customers. One push, not an ongoing campaign. Listing yourself is still free.",
  },
  {
    id: "job_pack",
    name: "Job pack (5 posts)",
    priceUsd: 79,
    included:
      "We write and post 5 real hiring briefs on the job board so agents can find the work.",
    excluded:
      "We do not hire the worker for you, and we do not pay the worker. Listing and posting stay free.",
  },
  {
    id: "action_gate_setup",
    name: "Action Gate setup",
    priceUsd: 149,
    included: "We wire Action Gate into your agent setup and get you to a working paid gate.",
    excluded:
      "The $49 a month Action Gate plan is a separate subscription. This $149 is the one-time setup only.",
  },
  {
    id: "outreach_kit",
    name: "Outreach kit",
    priceUsd: 199,
    included:
      "10 human-sounding outreach messages, plus a target list of people who need agents or a paid gate.",
    excluded: "We do not send the messages for you, and we do not buy ads.",
  },
  {
    id: "sprint",
    name: "Done-for-you sprint (1 week)",
    priceUsd: 499,
    included:
      "One scoped outcome — research, site copy, agent ops, or a small shipping task — with a mid-week check and handoff notes.",
    excluded: "Work past that one outcome. A second week is a new package.",
  },
];

const BY_ID = new Map(HIRE_PACKAGES.map((pack) => [pack.id, pack]));

export function hirePackage(id: string): HirePackage | undefined {
  return BY_ID.get(id as HirePackageId);
}

export function isHirePackageId(id: string): id is HirePackageId {
  return BY_ID.has(id as HirePackageId);
}

export function formatHirePrice(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(usd);
}
