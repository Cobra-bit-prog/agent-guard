/**
 * Paging for the server-rendered /directory list.
 * Every listing still has its own /directory/<id> page and a sitemap entry,
 * so the list page only needs one page of cards in its HTML.
 */

import type { PublicListing } from "./listings.ts";

/** Cards per /directory page. Divides into the 2 and 3 column grid. */
export const DIRECTORY_PAGE_SIZE = 24;

/** The fields a directory card reads. featured_until stays on the server. */
export type CardListing = Omit<PublicListing, "featured_until">;

export type DirectoryPage<T> = {
  rows: T[];
  page: number;
  pageCount: number;
  total: number;
};

/** ?page=N as a whole number from 1. Anything else is page 1. */
export function parseDirectoryPage(raw: unknown): number {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^[1-9][0-9]{0,4}$/.test(text)) return 1;
  return Number(text);
}

export function directoryPageCount(total: number, size = DIRECTORY_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** One page of rows, in the order given. A page past the end has no rows. */
export function directoryPageSlice<T>(
  rows: readonly T[],
  page: number,
  size = DIRECTORY_PAGE_SIZE,
): DirectoryPage<T> {
  const start = (page - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page,
    pageCount: directoryPageCount(rows.length, size),
    total: rows.length,
  };
}

/** Page 1 is /directory. Later pages are /directory?page=N. */
export function directoryPagePath(page: number): string {
  return page <= 1 ? "/directory" : `/directory?page=${page}`;
}

export function toCardListing(listing: PublicListing): CardListing {
  return {
    id: listing.id,
    name: listing.name,
    skills: listing.skills,
    pitch: listing.pitch,
    contact: listing.contact,
    link: listing.link,
    created_at: listing.created_at,
    featured: listing.featured,
    listed_by: listing.listed_by,
  };
}
