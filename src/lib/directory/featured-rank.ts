/**
 * Client-safe sort for the homepage strip.
 * The listings API already returns featured rows first. This keeps that
 * order if a response is unsorted, and drops a pin whose featured_until
 * has passed.
 */

export type MaybeFeatured = {
  featured?: boolean;
  featured_until?: string | null;
};

export function isFeaturedListing(listing: MaybeFeatured, nowMs: number): boolean {
  const untilRaw = listing.featured_until;
  const untilMs =
    typeof untilRaw === "string" && untilRaw.trim() ? Date.parse(untilRaw) : Number.NaN;
  const untilKnown = !Number.isNaN(untilMs);
  if (untilKnown && untilMs <= nowMs) return false;
  if (listing.featured === true) return true;
  return untilKnown && untilMs > nowMs;
}

/** Featured rows first. Relative order inside each group stays as given. */
export function featuredFirst<T extends MaybeFeatured>(listings: readonly T[], nowMs: number): T[] {
  const featured: T[] = [];
  const rest: T[] = [];
  for (const listing of listings) {
    if (isFeaturedListing(listing, nowMs)) featured.push(listing);
    else rest.push(listing);
  }
  return [...featured, ...rest];
}
