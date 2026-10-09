import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { featuredFirst, isFeaturedListing } from "./featured-rank.ts";
import {
  DIRECTORY_LIST_LIMIT,
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
const FEATURED = readFileSync(join(ROOT, "migrations/0033_agent_listing_featured.sql"), "utf8");
const SEED = readFileSync(join(ROOT, "migrations/0031_seed_agent_listings.sql"), "utf8");
const WAVE2 = readFileSync(join(ROOT, "migrations/0034_seed_agent_listings_wave2.sql"), "utf8");
const LISTED_BY = readFileSync(join(ROOT, "migrations/0036_agent_listing_listed_by.sql"), "utf8");
const NOW = new Date("2026-10-05T15:00:00.000Z");
/** 0031 inserts 55 names. 0034 inserts 254 more. No shared names. */
const SEEDED_LISTINGS = 55 + 254;

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
    const parsed = parseListing(listing({ contact: "https://example.com/hello", link: "  " }));
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
    assert.throws(
      () => parseListing(listing({ contact: "not-an-email" })),
      /email or an https link/,
    );
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

describe("directory seed migration", () => {
  it("inserts the verified rows and skips a name that already exists", async () => {
    const { db, sql } = await openDb();
    await db.exec(
      `insert into agent_listings (id, name, skills, pitch, contact, link)
       values
         ('agent_aaaaaaaaaaaaaaaaaaaaaaaa', 'AutoGPT', array['agents'], 'already here', 'https://agpt.co', 'https://agpt.co'),
         ('agent_bbbbbbbbbbbbbbbbbbbbbbbb', 'Orkas', array['planning'], 'live orkas', 'https://orkas.ai', 'https://orkas.ai')`,
    );
    await db.exec(SEED);
    const visible = await listVisibleListings(sql);
    const auto = visible.filter((row) => row.name.toLowerCase() === "autogpt");
    assert.equal(auto.length, 1);
    assert.equal(auto[0]?.pitch, "already here");
    const orkas = visible.filter((row) => row.name === "Orkas");
    assert.equal(orkas.length, 1);
    assert.equal(orkas[0]?.pitch, "live orkas");

    for (const name of [
      "Ops Agent",
      "firecrawl",
      "dify",
      "Agent directory boost",
      "Job pack (5 posts)",
      "Action Gate setup",
      "Outreach kit",
      "Done-for-you sprint (1 week)",
    ]) {
      assert.equal(visible.filter((row) => row.name === name).length, 1, name);
    }
    assert.equal(visible.filter((row) => row.name === "Action Gate").length, 0);
    assert.equal(visible.filter((row) => row.name === "Agent Meter").length, 0);
    assert.equal(visible.filter((row) => row.name === "Agent Control Marketplace").length, 0);

    for (const row of visible) {
      const parsed = parseListing({
        name: row.name,
        skills: row.skills,
        pitch: row.pitch,
        contact: row.contact,
        link: row.link ?? "",
      });
      assert.equal(parsed.name, row.name);
      assert.match(row.id, /^agent_[0-9a-f]{24}$/);
      assert.doesNotMatch(row.pitch, /escrow|refund|keep 10%/i);
    }
    const unclaimed = visible.filter((row) => row.pitch.includes("unclaimed"));
    assert.equal(unclaimed.length, 48);

    await db.exec(SEED);
    assert.equal((await listVisibleListings(sql)).length, visible.length);
    assert.equal(visible.length, 56);
  });

  it("returns wave 1 and wave 2 together, with a featured row first", async () => {
    const { db, sql } = await openDb();
    await db.exec(FEATURED);
    await db.exec(SEED);
    await db.exec(WAVE2);
    const listedAt = new Date("2026-10-07T12:00:00.000Z");
    const visible = await listVisibleListings(sql, listedAt);
    assert.equal(visible.length, SEEDED_LISTINGS);
    assert.ok(visible.length > 100);
    assert.ok(DIRECTORY_LIST_LIMIT >= visible.length);

    for (const name of ["Ops Agent", "Portkey", "Devon", "Vertex AI Agent Builder"]) {
      assert.equal(visible.filter((row) => row.name === name).length, 1, name);
    }

    const ops = visible.find((row) => row.name === "Ops Agent");
    assert.ok(ops);
    await db.query("update agent_listings set featured_until = $2 where id = $1", [
      ops.id,
      "2026-10-14T12:00:00.000Z",
    ]);
    const ranked = await listVisibleListings(sql, listedAt);
    assert.equal(ranked.length, SEEDED_LISTINGS);
    assert.equal(ranked[0]?.name, "Ops Agent");
    assert.equal(ranked[0]?.featured, true);
    assert.equal(ranked[1]?.featured, false);
    assert.equal(ranked.filter((row) => row.name === "Portkey").length, 1);

    await db.exec(WAVE2);
    assert.equal((await listVisibleListings(sql, listedAt)).length, SEEDED_LISTINGS);
  });
});

describe("directory list past the old cap of 100", () => {
  it("returns every visible row when the featured column is missing", async () => {
    const { db, sql } = await openDb();
    const count = 150;
    await db.query(
      `insert into agent_listings (id, name, skills, pitch, contact, created_at)
       select
         'agent_' || lpad(to_hex(i), 24, '0'),
         'Bulk ' || i,
         array['research']::text[],
         'A short pitch.',
         'bulk@example.com',
         $1::timestamptz + (i::text || ' seconds')::interval
       from generate_series(1, $2::int) as i`,
      [NOW, count],
    );
    const visible = await listVisibleListings(sql, NOW);
    assert.equal(visible.length, count);
    assert.equal(visible[0]?.name, `Bulk ${count}`);
    assert.equal(visible[count - 1]?.name, "Bulk 1");
  });

  it("keeps a featured row ahead of newer rows past 100", async () => {
    const { db, sql } = await openDb();
    await db.exec(FEATURED);
    const count = 150;
    await db.query(
      `insert into agent_listings (id, name, skills, pitch, contact, created_at)
       select
         'agent_' || lpad(to_hex(i), 24, '0'),
         'Bulk ' || i,
         array['research']::text[],
         'A short pitch.',
         'bulk@example.com',
         $1::timestamptz + (i::text || ' seconds')::interval
       from generate_series(1, $2::int) as i`,
      [NOW, count],
    );
    await db.query("update agent_listings set featured_until = $1 where name = 'Bulk 1'", [
      "2026-10-12T15:00:00.000Z",
    ]);
    const visible = await listVisibleListings(sql, NOW);
    assert.equal(visible.length, count);
    assert.equal(visible[0]?.name, "Bulk 1");
    assert.equal(visible[0]?.featured, true);
    assert.equal(visible[1]?.name, `Bulk ${count}`);
    assert.equal(visible[1]?.featured, false);
  });
});

describe("featured listings sort ahead of newest", () => {
  const now = Date.parse("2026-10-06T00:00:00.000Z");
  type Row = { id: string; featured?: boolean; featured_until?: string | null };

  it("keeps newest order when the API has no featured field", () => {
    const rows: Row[] = [{ id: "new" }, { id: "older" }];
    assert.deepEqual(
      featuredFirst(rows, now).map((row) => row.id),
      ["new", "older"],
    );
    assert.equal(isFeaturedListing({}, now), false);
  });

  it("puts live featured rows first and drops an expired pin", () => {
    const rows: Row[] = [
      { id: "newest" },
      { id: "pinned", featured: true },
      { id: "until", featured_until: "2026-10-13T00:00:00.000Z" },
      { id: "expired", featured: true, featured_until: "2026-10-01T00:00:00.000Z" },
    ];
    assert.deepEqual(
      featuredFirst(rows, now).map((row) => row.id),
      ["pinned", "until", "newest", "expired"],
    );
  });
});

describe("listed_by", () => {
  it("marks a new self-list as owner and backfills registry pitches as seed", async () => {
    const { db, sql } = await openDb();
    await db.exec(SEED);
    const before = await listVisibleListings(sql);
    const registry = before.find((row) => row.name === "AutoGPT");
    const service = before.find((row) => row.name === "Agent directory boost");
    assert.equal(registry?.listed_by, "seed");
    assert.equal(service?.listed_by, null);

    await db.exec(LISTED_BY);
    const posted = await createListing(sql, listing(), NOW, hashClientIp("203.0.113.50"));
    assert.equal(posted.listed_by, "owner");
    const after = await listVisibleListings(sql);
    assert.equal(after.find((row) => row.name === "AutoGPT")?.listed_by, "seed");
    assert.equal(after.find((row) => row.name === "Agent directory boost")?.listed_by, null);
    assert.equal(after.find((row) => row.id === posted.id)?.listed_by, "owner");

    const info = await db.query(
      `insert into agent_listings (id, name, skills, pitch, contact, link, ip_hash)
       values
         ('agent_cccccccccccccccccccccccc', 'Continue', array['code'], $1, 'https://continue.dev', 'https://continue.dev', null),
         ('agent_dddddddddddddddddddddddd', 'Steel', array['browser'], $2, 'https://steel.dev', 'https://steel.dev', null)
       returning id`,
      [
        "Open-source coding agent. Listed from public info; not affiliated.",
        "Hosted sessions. Listed by Agent Control from public info; not affiliated.",
      ],
    );
    assert.equal(info.rows.length, 2);
    await db.exec(LISTED_BY);
    const labeled = await listVisibleListings(sql);
    assert.equal(labeled.find((row) => row.name === "Continue")?.listed_by, "seed");
    assert.equal(labeled.find((row) => row.name === "Steel")?.listed_by, "seed");
  });
});

describe("directory page empty state", () => {
  it("says the list is empty and does not pretend agents are already listed", () => {
    const page = readFileSync(join(ROOT, "src/routes/directory.tsx"), "utf8");
    assert.match(page, /No agents listed yet\./);
    assert.match(page, /href="#featured"/);
    assert.match(page, /Feature a listing \(\$19 \/ 7 days\)/);
    const checkout = readFileSync(join(ROOT, "src/components/directory-featured.tsx"), "utf8");
    assert.match(checkout, /id="featured"/);
    assert.match(page, /Hire us · directory boost is \$49/);
    assert.match(page, /Listing your agent is free\. People reach you at the contact you leave\./);
    assert.match(page, /<form/);
    assert.doesNotMatch(page, /opens soon|coming soon/i);
    assert.doesNotMatch(page, /example agent|sample listing|fake listing/i);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(page, /shown\.slice|listings\.slice/);
    assert.doesNotMatch(
      page,
      /escrow|\bfunded\b|\bhirer\b|\bsignature\b|\bsettlement\b|\bprotocol\b|\brail\b|\bverified\b|\btrusted\b/i,
    );
  });
});
