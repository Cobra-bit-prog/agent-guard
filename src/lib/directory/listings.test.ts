import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  ListingError,
  POSTS_PER_HOUR,
  createListing,
  hashClientIp,
  listVisibleListings,
  parseListing,
  type ListingQuery,
} from "./listings.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = readFileSync(join(ROOT, "migrations/0027_agent_listings.sql"), "utf8");
const NOW = new Date("2026-10-05T15:00:00.000Z");

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

describe("agent listing validation", () => {
  it("accepts a free listing with comma separated skills", () => {
    const parsed = parseListing(listing());
    assert.equal(parsed.name, "Ada");
    assert.deepEqual(parsed.skills, ["research", "writing"]);
    assert.equal(parsed.contact, "ada@example.com");
    assert.equal(parsed.link, "https://example.com/ada");
  });

  it("accepts an https contact and an omitted link", () => {
    const parsed = parseListing(
      listing({ contact: "https://example.com/hello", link: "  " }),
    );
    assert.equal(parsed.contact, "https://example.com/hello");
    assert.equal(parsed.link, null);
  });

  it("rejects missing fields, long skills, bad contact, and the honeypot", () => {
    assert.throws(() => parseListing(listing({ name: "  " })), /Name is required/);
    assert.throws(() => parseListing(listing({ name: "x".repeat(81) })), /80/);
    assert.throws(() => parseListing(listing({ skills: "" })), /Skills are required/);
    assert.throws(() => parseListing(listing({ skills: "a,b,c,d,e,f,g,h,i" })), /1 to 8/);
    assert.throws(() => parseListing(listing({ skills: "x".repeat(33) })), /32/);
    assert.throws(() => parseListing(listing({ pitch: "" })), /Pitch is required/);
    assert.throws(() => parseListing(listing({ pitch: "x".repeat(281) })), /280/);
    assert.throws(() => parseListing(listing({ contact: "" })), /Contact is required/);
    assert.throws(() => parseListing(listing({ contact: "not-an-email" })), /email or an https link/);
    assert.throws(() => parseListing(listing({ contact: "http://example.com" })), /https link/);
    assert.throws(() => parseListing(listing({ link: "http://example.com" })), /https link/);
    assert.throws(
      () => parseListing(listing({ company_website: "https://spam.example" })),
      (err: unknown) => err instanceof ListingError && err.message === "Could not list this agent.",
    );
  });
});

describe("agent directory on a throwaway database", () => {
  it("starts empty", async () => {
    const { sql } = await openDb();
    assert.deepEqual(await listVisibleListings(sql), []);
  });

  it("stores a post and lists it newest first without the ip hash", async () => {
    const { sql } = await openDb();
    const first = await createListing(sql, listing(), NOW, hashClientIp("203.0.113.10"));
    const second = await createListing(
      sql,
      listing({ name: "Second", skills: ["notes", "mail"], contact: "https://example.com/second" }),
      new Date(NOW.getTime() + 1000),
      hashClientIp("203.0.113.10"),
    );
    const listings = await listVisibleListings(sql);
    assert.deepEqual(
      listings.map((row) => row.name),
      ["Second", "Ada"],
    );
    assert.equal(listings[1]?.id, first.id);
    assert.equal(listings[0]?.id, second.id);
    assert.deepEqual(listings[0]?.skills, ["notes", "mail"]);
    assert.equal(listings[0]?.contact, "https://example.com/second");
    assert.equal("ip_hash" in (listings[0] ?? {}), false);
    assert.equal("hidden_at" in (listings[0] ?? {}), false);
  });

  it("hides a listing when hidden_at is set", async () => {
    const { db, sql } = await openDb();
    const row = await createListing(sql, listing(), NOW, hashClientIp("203.0.113.11"));
    assert.equal((await listVisibleListings(sql)).length, 1);
    await db.query("update agent_listings set hidden_at = now() where id = $1", [row.id]);
    assert.deepEqual(await listVisibleListings(sql), []);
  });

  it("rate limits posts from the same IP hash", async () => {
    const { sql } = await openDb();
    const ip = hashClientIp("203.0.113.12");
    for (let i = 0; i < POSTS_PER_HOUR; i += 1) {
      await createListing(
        sql,
        listing({ name: `Agent ${i + 1}` }),
        new Date(NOW.getTime() + i * 1000),
        ip,
      );
    }
    await assert.rejects(
      () => createListing(sql, listing({ name: "One too many" }), NOW, ip),
      (err: unknown) => err instanceof ListingError && err.status === 429,
    );
    assert.equal((await listVisibleListings(sql)).length, POSTS_PER_HOUR);
  });

  it("does not store a honeypot submission", async () => {
    const { sql } = await openDb();
    await assert.rejects(
      () =>
        createListing(
          sql,
          listing({ company_website: "buy.example" }),
          NOW,
          hashClientIp("203.0.113.13"),
        ),
      /Could not list this agent/,
    );
    assert.deepEqual(await listVisibleListings(sql), []);
  });
});

describe("directory page empty state", () => {
  it("says the list is empty and does not pretend agents are already listed", () => {
    const page = readFileSync(join(ROOT, "src/routes/directory.tsx"), "utf8");
    assert.match(page, /No agents listed yet\./);
    assert.match(page, /Listing your agent is free\. People reach you at the contact you leave\./);
    assert.match(page, /<form/);
    assert.doesNotMatch(page, /opens soon|coming soon/i);
    assert.doesNotMatch(page, /example agent|sample listing|fake listing/i);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(
      page,
      /escrow|\bfunded\b|\bhirer\b|\bsignature\b|\bsettlement\b|\bprotocol\b|\brail\b|\bverified\b|\btrusted\b/i,
    );
  });
});
