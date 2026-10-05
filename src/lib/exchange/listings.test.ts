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
  hashPosterIp,
  listOpenJobs,
  parseListing,
  type ListingQuery,
} from "./listings.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = readFileSync(join(ROOT, "migrations/0025_exchange_jobs.sql"), "utf8");
const NOW = new Date("2026-10-05T15:00:00.000Z");
const DEADLINE = "2026-10-20";

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
    title: "Summarize the support tickets",
    summary: "Read the last twenty tickets and write a one-page note.",
    budget_usd: 40,
    deadline: DEADLINE,
    poster_kind: "human",
    contact: "ada@example.com",
    ...overrides,
  };
}

describe("listing validation", () => {
  it("accepts a free listing with a whole-dollar budget and a date deadline", () => {
    const parsed = parseListing(listing(), NOW);
    assert.equal(parsed.budget_usd, 40);
    assert.equal(parsed.poster_kind, "human");
    assert.equal(parsed.contact, "ada@example.com");
    assert.equal(parsed.deadline_at.toISOString(), "2026-10-20T23:59:59.999Z");
  });

  it("rejects missing fields, bad budgets, past deadlines, and the honeypot", () => {
    assert.throws(() => parseListing(listing({ title: "  " }), NOW), /Title is required/);
    assert.throws(() => parseListing(listing({ title: "x".repeat(141) }), NOW), /140/);
    assert.throws(() => parseListing(listing({ summary: "" }), NOW), /Say what you need done/);
    assert.throws(() => parseListing(listing({ budget_usd: 10.5 }), NOW), /whole dollar/);
    assert.throws(() => parseListing(listing({ budget_usd: 0 }), NOW), /1 to 1000000/);
    assert.throws(() => parseListing(listing({ poster_kind: "team" }), NOW), /human or agent/);
    assert.throws(() => parseListing(listing({ contact: "" }), NOW), /Contact is required/);
    assert.throws(() => parseListing(listing({ deadline: "2020-01-01" }), NOW), /future/);
    assert.throws(
      () => parseListing(listing({ company_website: "https://spam.example" }), NOW),
      (err: unknown) => err instanceof ListingError && err.message === "Could not post this job.",
    );
  });
});

describe("listing board on a throwaway database", () => {
  it("starts empty", async () => {
    const { sql } = await openDb();
    assert.deepEqual(await listOpenJobs(sql), []);
  });

  it("stores a post and lists it newest first", async () => {
    const { sql } = await openDb();
    const first = await createListing(sql, listing(), NOW, hashPosterIp("203.0.113.10"));
    const second = await createListing(
      sql,
      listing({ title: "Second note", poster_kind: "agent", contact: "@worker" }),
      new Date(NOW.getTime() + 1000),
      hashPosterIp("203.0.113.10"),
    );
    const jobs = await listOpenJobs(sql);
    assert.deepEqual(
      jobs.map((job) => job.title),
      ["Second note", "Summarize the support tickets"],
    );
    assert.equal(jobs[1]?.id, first.id);
    assert.equal(jobs[0]?.id, second.id);
    assert.equal(jobs[0]?.budget_usd, 40);
    assert.equal(jobs[0]?.poster_kind, "agent");
    assert.equal(jobs[0]?.contact, "@worker");
  });

  it("hides a listing when hidden_at is set", async () => {
    const { db, sql } = await openDb();
    const job = await createListing(sql, listing(), NOW, hashPosterIp("203.0.113.11"));
    assert.equal((await listOpenJobs(sql)).length, 1);
    await db.query("update exchange_jobs set hidden_at = now() where id = $1", [job.id]);
    assert.deepEqual(await listOpenJobs(sql), []);
  });

  it("rate limits posts from the same IP hash", async () => {
    const { sql } = await openDb();
    const ip = hashPosterIp("203.0.113.12");
    for (let i = 0; i < POSTS_PER_HOUR; i += 1) {
      await createListing(
        sql,
        listing({ title: `Job ${i + 1}` }),
        new Date(NOW.getTime() + i * 1000),
        ip,
      );
    }
    await assert.rejects(
      () => createListing(sql, listing({ title: "One too many" }), NOW, ip),
      (err: unknown) => err instanceof ListingError && err.status === 429,
    );
    assert.equal((await listOpenJobs(sql)).length, POSTS_PER_HOUR);
  });

  it("does not store a honeypot submission", async () => {
    const { sql } = await openDb();
    await assert.rejects(
      () =>
        createListing(
          sql,
          listing({ company_website: "buy.example" }),
          NOW,
          hashPosterIp("203.0.113.13"),
        ),
      /Could not post this job/,
    );
    assert.deepEqual(await listOpenJobs(sql), []);
  });
});

describe("exchange page empty state", () => {
  it("invites the first post and does not pretend jobs already exist", () => {
    const page = readFileSync(join(ROOT, "src/routes/exchange.tsx"), "utf8");
    assert.match(page, /No jobs posted yet\./);
    assert.match(page, /Posting is free\. Workers reach you at the contact you leave\./);
    assert.match(page, /<form/);
    assert.doesNotMatch(page, /opens soon|coming soon/i);
    assert.doesNotMatch(page, /example job|sample job|fake job/i);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(
      page,
      /escrow|\bfunded\b|\bhirer\b|\bsignature\b|\bsettlement\b|\bprotocol\b|\brail\b|\bheld\b|\bearned\b/i,
    );
  });
});
