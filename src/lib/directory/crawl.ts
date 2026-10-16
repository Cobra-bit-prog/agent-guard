/**
 * Crawl surfaces for the public directory.
 * Callers pass rows from listVisibleListings so hidden listings stay off
 * the sitemap, agents.json, and agents.txt — the same filter as
 * GET /api/v1/agents/listings.
 */

import { listingPitch } from "./cards.ts";
import { DIRECTORY_PAGE_SIZE } from "./page.ts";

export const SITE_ORIGIN = "https://agent-control.net";

/** How many names agents.txt prints. The full set is in agents.json. */
export const AGENTS_TXT_LISTING_LIMIT = 12;

export type DiscoveryListing = {
  id: string;
  name: string;
  pitch: string;
  url: string;
  endpoint?: string;
};

type ListingFields = {
  id: string;
  name: string;
  pitch: string;
  contact: string;
  link: string | null;
  created_at?: string;
};

export function listingAbsoluteUrl(id: string): string {
  return `${SITE_ORIGIN}/directory/${id}`;
}

/** Pitch text the directory page shows, so crawlers see the same sentence. */
export function publicPitch(listing: { pitch: string; contact: string }): string {
  return listingPitch(listing).pitch;
}

export function toDiscoveryListing(listing: ListingFields): DiscoveryListing {
  const record: DiscoveryListing = {
    id: listing.id,
    name: listing.name,
    pitch: publicPitch(listing),
    url: listingAbsoluteUrl(listing.id),
  };
  const endpoint = listing.link?.trim() ?? "";
  if (endpoint) record.endpoint = endpoint;
  return record;
}

export function listingLastMod(createdAt: string): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Static marketing URLs plus one /directory/<id> entry per visible listing. */
export function buildSitemapXml(
  staticXml: string,
  listings: ReadonlyArray<{ id: string; created_at: string }>,
): string {
  const existing = new Set(
    [...staticXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? ""),
  );
  const blocks: string[] = [];
  for (const listing of listings) {
    const loc = listingAbsoluteUrl(listing.id);
    if (existing.has(loc)) continue;
    existing.add(loc);
    const lastmod = listingLastMod(listing.created_at);
    const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
    blocks.push(
      `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodTag}\n    <changefreq>weekly</changefreq>\n  </url>`,
    );
  }
  if (blocks.length === 0 || !staticXml.includes("</urlset>")) return staticXml;
  return staticXml.replace("</urlset>", `${blocks.join("\n")}\n</urlset>`);
}

export function buildAgentsJson(staticJson: string, listings: readonly DiscoveryListing[]): string {
  const parsed = JSON.parse(staticJson) as Record<string, unknown>;
  parsed.listings = listings;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function oneLine(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 3)}...`;
}

/** Static agents.txt plus a short list and a link to the full JSON catalog. */
export function buildAgentsTxt(staticTxt: string, listings: readonly DiscoveryListing[]): string {
  const shown = listings.slice(0, AGENTS_TXT_LISTING_LIMIT);
  const lines = [
    "",
    "# Directory",
    `# Page: ${SITE_ORIGIN}/directory`,
    `# Every visible listing (id, name, pitch, url, endpoint): ${SITE_ORIGIN}/agents.json`,
    "# Hidden listings are left off.",
  ];
  if (shown.length === 0) {
    lines.push("# No public listings yet.");
  } else {
    lines.push(
      `# ${shown.length} of ${listings.length} shown here. The JSON file has the full list.`,
    );
    for (const listing of shown) {
      lines.push(`- ${oneLine(listing.name, 80)} — ${oneLine(listing.pitch, 140)} — ${listing.url}`);
    }
  }
  const base = staticTxt.endsWith("\n") ? staticTxt : `${staticTxt}\n`;
  return `${base}${lines.join("\n")}\n`;
}

export function listingJsonLd(listing: ListingFields): Record<string, unknown> {
  const url = listingAbsoluteUrl(listing.id);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: listing.name,
    description: publicPitch(listing),
    url,
    applicationCategory: "BusinessApplication",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
  const sameAs = listing.link?.trim() ?? "";
  if (sameAs) data.sameAs = sameAs;
  return data;
}

export function directoryItemListJsonLd(
  listings: readonly ListingFields[],
  offset = 0,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Agent directory",
    url: `${SITE_ORIGIN}/directory`,
    numberOfItems: listings.length,
    itemListElement: listings.map((listing, index) => ({
      "@type": "ListItem",
      position: offset + index + 1,
      item: {
        "@type": "SoftwareApplication",
        name: listing.name,
        description: publicPitch(listing),
        url: listingAbsoluteUrl(listing.id),
      },
    })),
  };
}

/** Keep a pitch that contains `<` from closing the script tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

const DIRECTORY_TITLE = "Agent directory — Agent Control";
const DIRECTORY_DESCRIPTION =
  "Listing your agent is free. People reach you at the contact you leave.";
const LISTING_FALLBACK_TITLE = "Listed agent — Agent Control";

export type DirectoryPaging = {
  page: number;
  pageCount: number;
  total: number;
};

type HeadTags = {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
  scripts?: Array<{ type: string; children: string }>;
};

function directoryPageUrl(page: number): string {
  return page <= 1 ? `${SITE_ORIGIN}/directory` : `${SITE_ORIGIN}/directory?page=${page}`;
}

/**
 * Head for one /directory page. Each page has its own canonical URL, with
 * rel=prev and rel=next to its neighbours. The ItemList lists only that
 * page's cards; every listing also has its own page and a sitemap entry.
 */
export function directoryPageHead(
  listings: readonly ListingFields[],
  paging: DirectoryPaging = { page: 1, pageCount: 1, total: listings.length },
): HeadTags {
  const { page, pageCount } = paging;
  const title = page > 1 ? `Agent directory, page ${page} — Agent Control` : DIRECTORY_TITLE;
  const url = directoryPageUrl(page);
  const head: HeadTags = {
    meta: [
      { title },
      { name: "description", content: DIRECTORY_DESCRIPTION },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: title },
      { property: "og:description", content: DIRECTORY_DESCRIPTION },
      { property: "og:url", content: url },
    ],
    links: [{ rel: "canonical", href: url }],
  };
  if (page > 1) head.links.push({ rel: "prev", href: directoryPageUrl(page - 1) });
  if (page < pageCount) head.links.push({ rel: "next", href: directoryPageUrl(page + 1) });
  if (listings.length > 0) {
    head.scripts = [
      {
        type: "application/ld+json",
        children: jsonLdScript(directoryItemListJsonLd(listings, (page - 1) * DIRECTORY_PAGE_SIZE)),
      },
    ];
  }
  return head;
}

const NOT_FOUND_TITLE = "Agent not found — Agent Control";

/** Head for an unknown or hidden /directory/<id>. The response is a 404 and is not indexed. */
export function notFoundPageHead(): { meta: Array<Record<string, string>> } {
  return {
    meta: [
      { title: NOT_FOUND_TITLE },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#eef3f8" },
    ],
  };
}

export function listingPageHead(listing: ListingFields | null): {
  meta: Array<Record<string, string>>;
  links?: Array<Record<string, string>>;
  scripts?: Array<{ type: string; children: string }>;
} {
  if (!listing) {
    return {
      meta: [
        { title: LISTING_FALLBACK_TITLE },
        { name: "description", content: DIRECTORY_DESCRIPTION },
        { name: "theme-color", content: "#eef3f8" },
        { property: "og:title", content: LISTING_FALLBACK_TITLE },
        { property: "og:description", content: DIRECTORY_DESCRIPTION },
      ],
    };
  }
  const description = publicPitch(listing) || DIRECTORY_DESCRIPTION;
  const title = `${listing.name} — Agent Control`;
  const url = listingAbsoluteUrl(listing.id);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: jsonLdScript(listingJsonLd(listing)),
      },
    ],
  };
}
