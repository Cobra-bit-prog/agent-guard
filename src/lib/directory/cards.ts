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
const UNCLAIMED = /Listed from public registry\s*-\s*unclaimed\.?/i;

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
  const unclaimed = UNCLAIMED.test(listing.pitch);
  const stripped = listing.pitch.replace(UNCLAIMED, " ").replace(/\s+/g, " ").trim();
  if (listing.contact.trim().toLowerCase() === OWN_CONTACT) {
    const sentence = stripped.split(/(?<=\.)\s+/)[0] ?? stripped;
    return {
      pitch: sentence,
      footnote: "An Agent Control service, not an outside agent.",
    };
  }
  if (unclaimed) {
    return {
      pitch: stripped,
      footnote: "Not our product. Listed from a public registry.",
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
