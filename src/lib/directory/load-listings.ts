import { createServerFn } from "@tanstack/react-start";
import type { PublicListing } from "./listings.ts";
import type { CardListing } from "./page.ts";

export type DirectoryLoadResult = {
  listings: PublicListing[];
  error: string | null;
};

export type DirectoryPageResult = {
  /** Only this page's cards, trimmed to the fields a card shows. */
  listings: CardListing[];
  page: number;
  pageCount: number;
  total: number;
  error: string | null;
};

export type DirectoryListingResult = {
  listing: PublicListing | null;
  error: string | null;
};

async function readVisible(): Promise<DirectoryLoadResult> {
  const { getSql } = await import("@/lib/db");
  const { isUndefinedTable, listVisibleListings } = await import("./listings.ts");
  try {
    const sql = await getSql();
    const listings = await listVisibleListings(sql);
    return { listings, error: null };
  } catch (err) {
    if (isUndefinedTable(err)) {
      return { listings: [], error: "Agent directory is not on this database yet." };
    }
    console.error("[directory] list failed", err instanceof Error ? err.name : "error");
    return { listings: [], error: "Could not load agents" };
  }
}

/** Visible directory rows for SSR. Hidden rows stay out, same as the public API. */
export const loadDirectoryListings = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryLoadResult> => readVisible(),
);

/** One page of visible rows for /directory, so the HTML carries 24 cards, not all of them. */
export const loadDirectoryPage = createServerFn({ method: "GET" })
  .validator((d: unknown) => ({
    page: (d as { page?: unknown } | null)?.page,
  }))
  .handler(async ({ data }): Promise<DirectoryPageResult> => {
    const { directoryPageSlice, parseDirectoryPage, toCardListing } = await import("./page.ts");
    const page = parseDirectoryPage(data.page);
    const loaded = await readVisible();
    const slice = directoryPageSlice(loaded.listings, page);
    return {
      listings: slice.rows.map(toCardListing),
      page: slice.page,
      pageCount: slice.pageCount,
      total: slice.total,
      error: loaded.error,
    };
  });

/** One visible listing for /directory/<id>. Unknown and hidden ids both come back null. */
export const loadDirectoryListing = createServerFn({ method: "GET" })
  .validator((d: unknown) => ({
    id: String((d as { id?: unknown } | null)?.id ?? ""),
  }))
  .handler(async ({ data }): Promise<DirectoryListingResult> => {
    const loaded = await readVisible();
    if (loaded.error) return { listing: null, error: loaded.error };
    return { listing: loaded.listings.find((row) => row.id === data.id) ?? null, error: null };
  });
