import { createServerFn } from "@tanstack/react-start";
import type { PublicListing } from "./listings.ts";

export type DirectoryLoadResult = {
  listings: PublicListing[];
  error: string | null;
};

/** Visible directory rows for SSR. Hidden rows stay out, same as the public API. */
export const loadDirectoryListings = createServerFn({ method: "GET" }).handler(
  async (): Promise<DirectoryLoadResult> => {
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
  },
);
