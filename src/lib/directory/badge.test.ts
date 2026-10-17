import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  BADGE_MESSAGE,
  FEATURED_BADGE_COLOR,
  FEATURED_BADGE_LABEL,
  LISTED_BADGE_COLOR,
  LISTED_BADGE_LABEL,
  badgeHtml,
  badgeMarkdown,
  escapeXml,
  listingBadgeSvg,
} from "./badge.ts";
import { handleBadgeRequest } from "./badge-http.ts";
import { buildSitemapXml } from "./crawl.ts";
import { createListing, hashClientIp, type ListingQuery } from "./listings.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = readFileSync(join(ROOT, "migrations/0027_agent_listings.sql"), "utf8");
const FEATURED = readFileSync(join(ROOT, "migrations/0033_agent_listing_featured.sql"), "utf8");
const LISTED_BY = readFileSync(join(ROOT, "migrations/0036_agent_listing_listed_by.sql"), "utf8");
const NOW = new Date("2026-10-05T15:00:00.000Z");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function wrap(db: PGlite): ListingQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

async function openDb(): Promise<{ db: PGlite; sql: ListingQuery }> {
  const db = new PGlite();
  await db.exec(MIGRATION);
  await db.exec(FEATURED);
  await db.exec(LISTED_BY);
  return { db, sql: wrap(db) };
}

function listing(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada",
    skills: "research, writing",
    pitch: "I read the tickets and write a short note.",
    contact: "ada@example.com",
    link: "https://example.com/ada",
    ...overrides,
  };
}

describe("listing badge svg", () => {
  it("draws a listed badge and a featured badge with a different accent", () => {
    const listed = listingBadgeSvg({ featured: false });
    assert.match(listed, new RegExp(LISTED_BADGE_LABEL));
    assert.match(listed, new RegExp(BADGE_MESSAGE));
    assert.match(listed, new RegExp(LISTED_BADGE_COLOR));
    assert.doesNotMatch(listed, new RegExp(FEATURED_BADGE_LABEL));
    assert.doesNotMatch(listed, /@import|fonts\.google|<script|href="https?:/i);
    assert.match(listed, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

    const featured = listingBadgeSvg({ featured: true });
    assert.match(featured, new RegExp(FEATURED_BADGE_LABEL));
    assert.match(featured, new RegExp(BADGE_MESSAGE));
    assert.match(featured, new RegExp(FEATURED_BADGE_COLOR));
    assert.doesNotMatch(featured, new RegExp(LISTED_BADGE_LABEL));
    assert.doesNotMatch(featured, new RegExp(LISTED_BADGE_COLOR));
  });

  it("escapes dynamic text in the svg", () => {
    const raw = `A<B>&"C'`;
    const svg = listingBadgeSvg({ featured: false, label: raw, message: "ok <tag>" });
    assert.match(svg, new RegExp(escapeXml(raw)));
    assert.match(svg, /ok &lt;tag&gt;/);
    assert.equal(escapeXml(raw), "A&lt;B&gt;&amp;&quot;C&apos;");
    assert.doesNotMatch(svg, /A<B>/);
    assert.doesNotMatch(svg, /<tag>/);
    assert.doesNotMatch(svg, /&amp;amp;/);
  });

  it("builds the readme snippets", () => {
    const id = "agent_da333e9b7f67f7f8b362d42a";
    assert.equal(
      badgeMarkdown(id),
      `[![Listed on Agent Control](https://agent-control.net/badge/${id}.svg)](https://agent-control.net/directory/${id})`,
    );
    assert.equal(
      badgeHtml(id),
      `<a href="https://agent-control.net/directory/${id}"><img src="https://agent-control.net/badge/${id}.svg" alt="Listed on Agent Control"></a>`,
    );
    assert.match(badgeMarkdown(id, true), /Featured on Agent Control/);
    assert.match(badgeHtml(id, true), /alt="Featured on Agent Control"/);
  });
});

describe("listing badge route", () => {
  it("returns svg for a visible listing", async () => {
    const { sql } = await openDb();
    const row = await createListing(sql, listing(), NOW, hashClientIp("203.0.113.8"));
    const response = await handleBadgeRequest(row.id, sql, NOW);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.match(response.headers.get("cache-control") ?? "", /public, max-age=3600/);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.text();
    assert.match(body, /Listed on/);
    assert.match(body, /Agent Control/);
    assert.match(body, /<svg/);
  });

  it("uses the featured words when the listing is featured", async () => {
    const { db, sql } = await openDb();
    const row = await createListing(sql, listing(), NOW, hashClientIp("203.0.113.9"));
    const until = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
    await db.query("update agent_listings set featured_until = $2 where id = $1", [row.id, until]);
    const response = await handleBadgeRequest(row.id, sql, NOW);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
    const body = await response.text();
    assert.match(body, /Featured on/);
    assert.match(body, new RegExp(FEATURED_BADGE_COLOR));
    assert.doesNotMatch(body, /Listed on/);
  });

  it("returns 404 for an unknown id and a hidden listing", async () => {
    const { db, sql } = await openDb();
    const missing = await handleBadgeRequest("agent_0123456789abcdef01234567", sql, NOW);
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get("content-type") ?? "", /text\/plain/);
    assert.doesNotMatch(await missing.text(), /<svg/);

    const row = await createListing(
      sql,
      listing({ name: "Hidden" }),
      NOW,
      hashClientIp("203.0.113.10"),
    );
    await db.query("update agent_listings set hidden_at = now() where id = $1", [row.id]);
    const hidden = await handleBadgeRequest(row.id, sql, NOW);
    assert.equal(hidden.status, 404);
    assert.equal(await hidden.text(), "This agent is not on the list.");
  });

  it("mentions the badge in the listing page, skill, and llms, and leaves it off the sitemap", () => {
    const page = read("src/routes/directory_.$id.tsx");
    assert.match(page, /ListingBadgeShare/);
    assert.match(page, /Feature this listing \(\$19 \/ 7 days\)/);
    const share = read("src/components/listing-badge.tsx");
    assert.match(share, /Show you're listed/);
    assert.match(share, /Add this badge to your site or README so people can find you here\./);
    assert.match(share, /CopyCode/);
    assert.match(read("public/skill.md"), /badge snippet/);
    assert.match(read("public/llms.txt"), /badge snippet/);
    assert.match(read("public/robots.txt"), /Allow: \/badge/);
    const sitemap = read("public/sitemap.xml");
    assert.doesNotMatch(sitemap, /\/badge\//);
    const built = buildSitemapXml(sitemap, [
      { id: "agent_da333e9b7f67f7f8b362d42a", created_at: "2026-10-05T00:00:00.000Z" },
    ]);
    assert.doesNotMatch(built, /\/badge\//);
    assert.match(built, /agent_da333e9b7f67f7f8b362d42a/);
  });
});
