import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { directoryPageHead, notFoundPageHead } from "./crawl.ts";
import {
  DIRECTORY_PAGE_SIZE,
  directoryPageCount,
  directoryPagePath,
  directoryPageSlice,
  parseDirectoryPage,
  toCardListing,
} from "./page.ts";
import type { PublicListing } from "./listings.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function row(n: number): PublicListing {
  return {
    id: `agent_${String(n).padStart(24, "0")}`,
    name: `Agent ${n}`,
    skills: ["research"],
    pitch: `Pitch ${n}.`,
    contact: `a${n}@example.com`,
    link: null,
    created_at: "2026-10-01T00:00:00.000Z",
    featured: n === 1,
    featured_until: n === 1 ? "2026-11-01T00:00:00.000Z" : null,
    listed_by: null,
  };
}

const ROWS = Array.from({ length: 50 }, (_, i) => row(i + 1));

describe("directory paging", () => {
  it("reads ?page as a whole number and falls back to page 1", () => {
    assert.equal(parseDirectoryPage(undefined), 1);
    assert.equal(parseDirectoryPage("3"), 3);
    assert.equal(parseDirectoryPage(4), 4);
    for (const bad of ["0", "-1", "1.5", "abc", "", "01", "999999", null, {}]) {
      assert.equal(parseDirectoryPage(bad), 1, String(bad));
    }
  });

  it("slices pages of 24 in the given order", () => {
    assert.equal(DIRECTORY_PAGE_SIZE, 24);
    assert.equal(directoryPageCount(0), 1);
    assert.equal(directoryPageCount(24), 1);
    assert.equal(directoryPageCount(25), 2);
    const first = directoryPageSlice(ROWS, 1);
    assert.equal(first.rows.length, 24);
    assert.equal(first.rows[0]?.id, ROWS[0]?.id);
    assert.equal(first.pageCount, 3);
    assert.equal(first.total, 50);
    const last = directoryPageSlice(ROWS, 3);
    assert.deepEqual(
      last.rows.map((r) => r.id),
      ROWS.slice(48).map((r) => r.id),
    );
    assert.equal(directoryPageSlice(ROWS, 4).rows.length, 0);
  });

  it("links page 1 as /directory and later pages as ?page=N", () => {
    assert.equal(directoryPagePath(1), "/directory");
    assert.equal(directoryPagePath(2), "/directory?page=2");
  });

  it("keeps only card fields in the hydration rows", () => {
    const card = toCardListing(row(1));
    assert.equal("featured_until" in card, false);
    assert.deepEqual(Object.keys(card).sort(), [
      "contact",
      "created_at",
      "featured",
      "id",
      "link",
      "listed_by",
      "name",
      "pitch",
      "skills",
    ]);
  });

  it("gives each page its own canonical with prev and next", () => {
    const one = directoryPageHead(directoryPageSlice(ROWS, 1).rows, {
      page: 1,
      pageCount: 3,
      total: 50,
    });
    assert.deepEqual(one.links, [
      { rel: "canonical", href: "https://agent-control.net/directory" },
      { rel: "next", href: "https://agent-control.net/directory?page=2" },
    ]);
    const two = directoryPageHead(directoryPageSlice(ROWS, 2).rows, {
      page: 2,
      pageCount: 3,
      total: 50,
    });
    assert.deepEqual(two.links, [
      { rel: "canonical", href: "https://agent-control.net/directory?page=2" },
      { rel: "prev", href: "https://agent-control.net/directory" },
      { rel: "next", href: "https://agent-control.net/directory?page=3" },
    ]);
    assert.ok(two.meta.some((m) => m.title === "Agent directory, page 2 — Agent Control"));
    const three = directoryPageHead(directoryPageSlice(ROWS, 3).rows, {
      page: 3,
      pageCount: 3,
      total: 50,
    });
    assert.deepEqual(three.links, [
      { rel: "canonical", href: "https://agent-control.net/directory?page=3" },
      { rel: "prev", href: "https://agent-control.net/directory?page=2" },
    ]);
  });

  it("lists only the page's rows in the ItemList, numbered from the page offset", () => {
    const head = directoryPageHead(directoryPageSlice(ROWS, 2).rows, {
      page: 2,
      pageCount: 3,
      total: 50,
    });
    const json = JSON.parse(head.scripts?.[0]?.children ?? "{}") as {
      numberOfItems: number;
      itemListElement: Array<{ position: number }>;
    };
    assert.equal(json.numberOfItems, 24);
    assert.equal(json.itemListElement[0]?.position, 25);
    assert.equal(json.itemListElement[23]?.position, 48);
  });

  it("keeps the one-page head the same as before", () => {
    const head = directoryPageHead(ROWS.slice(0, 3));
    assert.deepEqual(head.links, [
      { rel: "canonical", href: "https://agent-control.net/directory" },
    ]);
    assert.ok(head.meta.some((m) => m.title === "Agent directory — Agent Control"));
  });
});

describe("directory not found", () => {
  it("marks the not-found head noindex", () => {
    const head = notFoundPageHead();
    assert.ok(head.meta.some((m) => m.name === "robots" && m.content === "noindex"));
    assert.ok(head.meta.some((m) => m.title === "Agent not found — Agent Control"));
  });

  it("throws notFound for unknown and hidden ids and out-of-range pages", () => {
    const detail = read("src/routes/directory_.$id.tsx");
    assert.match(detail, /loadDirectoryListing\(/);
    assert.match(detail, /if \(!loaded\.error && !loaded\.listing\) throw notFound\(\)/);
    assert.match(detail, /notFoundComponent: DirectoryNotFound/);
    assert.match(detail, /notFoundPageHead\(\)/);
    const list = read("src/routes/directory.tsx");
    assert.match(list, /loaded\.page > loaded\.pageCount\) throw notFound\(\)/);
    assert.match(list, /notFoundComponent: DirectoryNotFound/);
    assert.match(list, /loadDirectoryPage\(/);
    assert.doesNotMatch(list, /loadDirectoryListings\(/);
  });

  it("looks up a single listing from visible rows only", () => {
    const loader = read("src/lib/directory/load-listings.ts");
    assert.match(loader, /listVisibleListings/);
    assert.match(loader, /export const loadDirectoryListing = /);
  });

  it("links the not-found page back to /directory", () => {
    const page = read("src/components/directory-not-found.tsx");
    assert.match(page, /href="\/directory"|to="\/directory"/);
    assert.doesNotMatch(page, /text-\[\d+px\]/);
  });

  it("uses the type scale on the pager", () => {
    const list = read("src/routes/directory.tsx");
    assert.match(list, /function DirectoryPager/);
    assert.match(list, /rel="prev"/);
    assert.match(list, /rel="next"/);
    assert.doesNotMatch(list, /text-\[\d+px\]/);
  });
});

describe("directory card layout", () => {
  it("does not guess card heights, so rendering cards never shifts the clip or Get featured", () => {
    const css = read("src/styles.css");
    const start = css.indexOf(".hire-card {");
    assert.ok(start >= 0);
    const rule = css.slice(start, css.indexOf("}", start));
    assert.doesNotMatch(rule, /^\s*content-visibility\s*:/m);
    assert.doesNotMatch(rule, /^\s*contain-intrinsic-size\s*:/m);
    assert.doesNotMatch(css, /\.hire-card[^{]*\{[^}]*content-visibility\s*:/);
  });

  it("uses .hire-card only on /directory, so the homepage is untouched", () => {
    assert.match(read("src/routes/directory.tsx"), /className=\{`hire-card board-row/);
    assert.doesNotMatch(read("src/routes/index.tsx"), /hire-card/);
  });
});
