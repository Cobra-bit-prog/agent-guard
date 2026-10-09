/** Display helpers for directory cards. Seed text is shortened here, not in SQL. */

export const DIRECTORY_CATEGORIES = [
  "Research",
  "Code",
  "Content",
  "Ops",
  "Sales",
  "Other",
] as const;

export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number];

const OWN_CONTACT = "support@agent-control.net";
const SEED_PITCH =
  /listed from public registry|listed from public info|listed by agent control from public info/i;
const SEED_DISCLAIMERS = [
  /\s*Listed by Agent Control from public info; not affiliated\.?/gi,
  /\s*Listed from public info; not affiliated\.?/gi,
  /\s*Listed from public registry\s*-\s*unclaimed\.?/gi,
];

export type ListingOrigin = "owner" | "seed";

export const SEEDED_LABEL = "Seeded · unclaimed";
export const OWNER_LABEL = "Listed by owner";
export const CLAIM_LABEL = "Claim this listing";

/** Registry copies say so in the pitch. Strip that line so the label is the only notice. */
export function stripSeedDisclaimer(pitch: string): string {
  let next = pitch;
  for (const pattern of SEED_DISCLAIMERS) next = next.replace(pattern, " ");
  return next.replace(/\s+/g, " ").trim();
}

/**
 * owner: posted through the free self-list API.
 * seed: copied from a public registry.
 * null: an Agent Control service.
 * A stored listed_by wins. Until that column is on the database, the pitch is the signal.
 */
export function listingOrigin(listing: {
  pitch: string;
  contact: string;
  listed_by?: ListingOrigin | null;
}): ListingOrigin | null {
  if (listing.listed_by === "owner" || listing.listed_by === "seed") return listing.listed_by;
  if (SEED_PITCH.test(listing.pitch)) return "seed";
  if (listing.contact.trim().toLowerCase() === OWN_CONTACT) return null;
  return "owner";
}

export function claimListingHref(id: string): string {
  return `mailto:${OWN_CONTACT}?subject=${encodeURIComponent(`Claim listing ${id}`)}`;
}

const CATEGORY_RULES: {
  category: Exclude<DirectoryCategory, "Other">;
  pattern: RegExp;
}[] = [
  { category: "Research", pattern: /\b(research|scrape|scraping|crawl|crawler|dataset|paper)\b/i },
  { category: "Code", pattern: /\b(code|coding|developer|software|github|terminal|sdk|framework)\b/i },
  { category: "Content", pattern: /\b(content|copy|copywriting|writing|blog|newsletter)\b/i },
  { category: "Ops", pattern: /\b(ops|deploy|deploys|dns|release|workflow|automation)\b/i },
  { category: "Sales", pattern: /\b(sales|hiring|outreach|leads)\b/i },
];

export function listingInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0];
  if (!first) return "?";
  const last = parts[parts.length - 1];
  if (parts.length === 1 || !last) return first.slice(0, 2).toUpperCase();
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export function listingSkillChips(skills: readonly string[]): string[] {
  return skills.filter((skill) => skill.trim().length > 0).slice(0, 3);
}

export function listingPitch(listing: { pitch: string; contact: string }): {
  pitch: string;
  footnote: string | null;
} {
  const stripped = stripSeedDisclaimer(listing.pitch);
  if (listing.contact.trim().toLowerCase() === OWN_CONTACT) {
    const sentence = stripped.split(/(?<=\.)\s+/)[0] ?? stripped;
    return {
      pitch: sentence,
      footnote: "An Agent Control service, not an outside agent.",
    };
  }
  return { pitch: stripped, footnote: null };
}

export function listingCategory(listing: {
  name: string;
  skills: readonly string[];
  pitch: string;
}): DirectoryCategory {
  const haystack = [listing.name, ...listing.skills, listing.pitch].join(" ");
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(haystack)) return rule.category;
  }
  return "Other";
}

export function listingContactActions(listing: {
  contact: string;
  link: string | null;
}): { label: "Email" | "Open site"; href: string }[] {
  const contact = listing.contact.trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : null;
  const link = listing.link?.trim() ?? "";
  const site = link.startsWith("https://")
    ? link
    : !email && contact.startsWith("https://")
      ? contact
      : null;
  const actions: { label: "Email" | "Open site"; href: string }[] = [];
  if (email) actions.push({ label: "Email", href: `mailto:${email}` });
  if (site) actions.push({ label: "Open site", href: site });
  return actions;
}
