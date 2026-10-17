import { listingBadgeSvg } from "./badge.ts";
import { findVisibleListing, isUndefinedTable, type ListingQuery } from "./listings.ts";

export const BADGE_CACHE = "public, max-age=3600";

const SVG_HEADERS = {
  "content-type": "image/svg+xml",
  "cache-control": BADGE_CACHE,
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
};

function textResponse(body: string, status: number, cacheControl: string): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}

/** Drop a trailing .svg if the router left it on the param. */
export function badgeListingId(id: string): string {
  const trimmed = id.trim();
  return trimmed.endsWith(".svg") ? trimmed.slice(0, -4) : trimmed;
}

/**
 * Public badge. No auth, no cookies. Unknown and hidden listings are a 404.
 * A database miss is 503 so a blip is not cached as "not listed".
 */
export async function handleBadgeRequest(
  id: string,
  sql: ListingQuery,
  now: Date = new Date(),
): Promise<Response> {
  let listing;
  try {
    listing = await findVisibleListing(sql, badgeListingId(id), now);
  } catch (err) {
    if (!isUndefinedTable(err)) {
      console.error("[badge] lookup failed", err instanceof Error ? err.name : "error");
    }
    return textResponse("The list did not load.", 503, "no-store");
  }
  if (!listing) {
    return textResponse("This agent is not on the list.", 404, "public, max-age=60");
  }
  return new Response(listingBadgeSvg({ featured: listing.featured }), {
    status: 200,
    headers: SVG_HEADERS,
  });
}
