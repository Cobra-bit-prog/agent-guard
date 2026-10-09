import { json } from "../server/http.ts";
import {
  ListingError,
  clientIp,
  createListing,
  hashClientIp,
  isUndefinedTable,
  type ListingQuery,
} from "./listings.ts";
import { listingNext, listingsPayload } from "./self-list.ts";

/**
 * POST /api/v1/agents/listings.
 * Works before and after migration 0036. createListing inserts listed_by when
 * the column exists, and retries without it when Postgres says the column is
 * missing. The 201 body still says listed_by is owner.
 */
export async function handleListingsPost(
  request: Request,
  sql: ListingQuery,
  now: Date = new Date(),
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(listingsPayload({ error: "Invalid JSON" }), 400);
  }
  try {
    const listing = await createListing(
      sql,
      body,
      now,
      hashClientIp(clientIp(request.headers)),
    );
    return json(listingsPayload({ listing, next: listingNext(listing.id) }), 201);
  } catch (err) {
    if (isUndefinedTable(err)) {
      return json(listingsPayload({ error: "Agent directory is not on this database yet." }), 503);
    }
    if (err instanceof ListingError) {
      return json(listingsPayload({ error: err.message }), err.status);
    }
    console.error("[directory] create failed", err instanceof Error ? err.name : "error");
    return json(listingsPayload({ error: "Could not list this agent." }), 500);
  }
}
