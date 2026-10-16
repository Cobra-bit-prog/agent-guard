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
import { SEED_JOB_CONTACT, SEED_JOB_IDS, isSeedJob, splitJobBoardStats } from "./seed-jobs.ts";

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
    assert.throws(() => parseListing(listing({ hidden: "true" }), NOW), /hidden must be true or false/);
    assert.equal(parseListing(listing(), NOW).hidden, false);
    assert.equal(parseListing(listing({ hidden: false }), NOW).hidden, false);
    assert.equal(parseListing(listing({ hidden: true }), NOW).hidden, true);
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

  it("keeps a hidden post off the public list and returns it to the poster", async () => {
    const { db, sql } = await openDb();
    const hidden = await createListing(
      sql,
      listing({ title: "Quiet check", hidden: true }),
      NOW,
      hashPosterIp("203.0.113.40"),
    );
    assert.equal(hidden.title, "Quiet check");
    assert.equal(hidden.hidden, true);
    assert.equal("hidden_at" in hidden, false);
    const visible = await createListing(
      sql,
      listing({ title: "Public note", hidden: false }),
      new Date(NOW.getTime() + 1000),
      hashPosterIp("203.0.113.41"),
    );
    const jobs = await listOpenJobs(sql);
    assert.deepEqual(
      jobs.map((job) => job.id),
      [visible.id],
    );
    assert.equal("hidden" in (jobs[0] ?? {}), false);
    assert.equal("hidden_at" in (jobs[0] ?? {}), false);
    const rows = await db.query<{ hidden_at: Date | null }>(
      "select hidden_at from exchange_jobs where id = $1",
      [hidden.id],
    );
    assert.ok(rows.rows[0]?.hidden_at);
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

describe("seed jobs stay off the outside scoreboard", () => {
  it("marks the 2026-10-05 seed ids and support@ contact, and leaves outside posts alone", () => {
    for (const id of SEED_JOB_IDS) {
      assert.equal(isSeedJob({ id, contact: "ada@example.com" }), true, id);
    }
    assert.equal(isSeedJob({ id: "job_outside", contact: `mailto:${SEED_JOB_CONTACT}` }), true);
    assert.equal(isSeedJob({ id: "job_outside", contact: "  Support@Agent-Control.net " }), true);
    assert.equal(isSeedJob({ id: "job_outside", contact: "ada@example.com" }), false);
    assert.equal(isSeedJob({ id: "job_outside", contact: "ask support@agent-control.net" }), false);

    const split = splitJobBoardStats([
      { id: SEED_JOB_IDS[0], contact: "ada@example.com" },
      { id: "job_from_outside", contact: "ada@example.com" },
      { id: "job_ours_by_contact", contact: SEED_JOB_CONTACT },
    ]);
    assert.deepEqual(split, { open: 3, outside: 1, seed: 2 });
  });
});

describe("exchange page footer", () => {
  it("links agents to the docs in plain words instead of raw API paths", () => {
    const page = readFileSync(join(ROOT, "src/routes/exchange.tsx"), "utf8");
    const markup = page.slice(page.indexOf("return ("));
    assert.doesNotMatch(markup, /(GET|POST) \/api\//);
    assert.match(
      page,
      /For agents:\{" "\}\s*<a href="\/llms\.txt" className="underline hover:text-fg">\s*read the docs\s*<\/a>/,
    );
    assert.match(
      page,
      /<p className="mt-10 max-w-\[40rem\] text-meta text-muted">\s*Agents can post the same way\./,
    );
    assert.doesNotMatch(page, /text-\[\d+px\]/);
  });

  it("keeps pay-when-done, hold, escrow, and refund wording off public example copy", () => {
    const banned =
      /pay only when|paid when|when the job is done|pay-when-done|pay when done|escrow|we hold|hold the money|refund/i;
    for (const rel of [
      "src/routes/exchange.tsx",
      "src/routes/api/v1/check_action.ts",
      "public/llms.txt",
      "public/agents.txt",
      "public/skill.md",
    ]) {
      assert.doesNotMatch(readFileSync(join(ROOT, rel), "utf8"), banned, rel);
    }
    const gate = readFileSync(join(ROOT, "src/lib/action-gate.ts"), "utf8");
    assert.match(gate, /"summary":"Send the order update"/);
    assert.doesNotMatch(gate, /refund/i);
  });
});

describe("exchange page empty state", () => {
  it("invites the first post and does not pretend jobs already exist", () => {
    const page = readFileSync(join(ROOT, "src/routes/exchange.tsx"), "utf8");
    assert.match(page, /No jobs posted yet\./);
    assert.match(page, /Be the first outside post — it's free\./);
    assert.match(page, /Early jobs from our team — your post can sit beside them today\./);
    assert.match(page, /From the Agent Control team/);
    assert.match(page, /isSeedJob/);
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

const DIRECT_PAY = readFileSync(
  join(ROOT, "migrations/0044_exchange_jobs_direct_pay_copy.sql"),
  "utf8",
);

/** Live /api/v1/exchange/jobs rows on 2026-10-16, with the summary 0044 should leave. */
const LIVE_JOBS: { id: string; title: string; before: string; after: string }[] = [
  {
    id: "job_fe914b788a7921ad33b9bbf5",
    title: "Check our llms.txt and agents.json and send fixes",
    before:
      "From the Agent Control team (we built this board). Real work we need done. Review agent-control.net/llms.txt, /agents.json and /agents.txt against what agent crawlers and tools expect. Send a short list of concrete fixes. Paid when we say it's done.",
    after:
      "From the Agent Control team (we built this board). Real work we need done. Review agent-control.net/llms.txt, /agents.json and /agents.txt against what agent crawlers and tools expect. Send a short list of concrete fixes. We pay directly in USDC once we accept the work.",
  },
  {
    id: "job_07c4f61e994fbe5f183e80da",
    title: "Design a share image for our agent directory page (1200x630)",
    before:
      "From the Agent Control team (we built this board). Real work we need done. Make a clean link-preview image for agent-control.net/directory that matches the site's look. Send PNG plus source file. Paid when we say it's done.",
    after:
      "From the Agent Control team (we built this board). Real work we need done. Make a clean link-preview image for agent-control.net/directory that matches the site's look. Send PNG plus source file. We pay directly in USDC once we accept the work.",
  },
  {
    id: "job_d357d4fcf49bb1be4e661cf1",
    title: "Find 20 people building AI agents who might list them for free",
    before:
      "From the Agent Control team (we built this board). Real work we need done. Send a simple sheet of 20 public agent builders (name, agent, public link, why it fits). Public info only, no scraped emails. Paid when we say it's done.",
    after:
      "From the Agent Control team (we built this board). Real work we need done. Send a simple sheet of 20 public agent builders (name, agent, public link, why it fits). Public info only, no scraped emails. We pay directly in USDC once we accept the work.",
  },
  {
    id: "job_04b5a2994c342cea284efa33",
    title: "Test our job board on your phone and send a bug list",
    before:
      "From the Agent Control team (we built this board). Real work we need done. Open agent-control.net/exchange and /directory on a phone. Post a test job, try the forms, and send a short list of anything broken or confusing, with screenshots. Paid when we say it's done.",
    after:
      "From the Agent Control team (we built this board). Real work we need done. Open agent-control.net/exchange and /directory on a phone. Post a test job, try the forms, and send a short list of anything broken or confusing, with screenshots. We pay directly in USDC once we accept the work.",
  },
  {
    id: "job_f6a0179b400b8e458d198d4c",
    title: "Write a short guide: post a job on our board with one curl command",
    before:
      "From the Agent Control team (we built this board). Real work we need done. Write a clear 300-500 word guide with a working curl example for POST /api/v1/exchange/jobs and GET to list jobs. Plain English, tested. Paid when we say it's done.",
    after:
      "From the Agent Control team (we built this board). Real work we need done. Write a clear 300-500 word guide with a working curl example for POST /api/v1/exchange/jobs and GET to list jobs. Plain English, tested. We pay directly in USDC once we accept the work.",
  },
  {
    id: "job_adb51e6c83df2b8386d807be",
    title: "Write 5 forum replies that invite real jobs",
    before:
      "Draft 5 short forum replies (HN / Indie Hackers / Reddit tone) inviting builders to post a job or list an agent on https://agent-control.net/exchange and /directory. No spam, no refund/escrow claims, no upvote asks. Deliver as numbered list ready to paste.",
    after:
      "Draft 5 short forum replies (HN / Indie Hackers / Reddit tone) inviting builders to post a job or list an agent on https://agent-control.net/exchange and /directory. No spam, no upvote asks. Deliver as numbered list ready to paste.",
  },
  {
    id: "job_0103f20d991897ad60e60ebb",
    title: "Compare 5 agent job boards vs Agent Control",
    before:
      "Pick up to 5 live agent hiring/listing sites. One-page comparison: listing fee, job fee, escrow?, agent vs human focus, what’s missing. End with 3 concrete ideas we should copy. Sources with links.",
    after:
      "Pick up to 5 live agent hiring/listing sites. One-page comparison: listing fee, job fee, how pay works, agent vs human focus, what’s missing. End with 3 concrete ideas we should copy. Sources with links.",
  },
  {
    id: "job_24229f12b5d2d68fc301e416",
    title: "Draft a one-page launch note for Agent Control",
    before:
      "Write one page of launch copy (markdown) for https://agent-control.net — free job board at /exchange, list agents free at /directory. Honest: posting costs nothing; you pay only when the job is done; no escrow claims. Tone: human, not hype.",
    after:
      "Write one page of launch copy (markdown) for https://agent-control.net — free job board at /exchange, list agents free at /directory. Honest: posting costs nothing. Tone: human, not hype.",
  },
  {
    id: "job_6e3cd2c6081fabf64d3ce1aa",
    title: "Find 10 free AI agent directories with submit links",
    before:
      "Build a markdown table of 10 free directories or lists where we can list Agent Control (marketplace for agent services). Columns: name, submit URL, login needed?, notes. Skip paid-only and X-only paths. Prefer agent/job marketplace fit.",
    after:
      "Build a markdown table of 10 free directories or lists where we can list Agent Control (marketplace for agent services). Columns: name, submit URL, login needed?, notes. Skip paid-only and X-only paths. Prefer agent/job marketplace fit.",
  },
  {
    id: "job_6ad6791aeebb2e3b31573fe5",
    title: "Write a plain FAQ for our agent job board",
    before:
      "Read https://agent-control.net and write a short FAQ (8–12 Q&As) in plain English covering: free job posts, free agent listings, how pay works today (agree with the worker; pay-through-us not live), and how to apply. Deliver as markdown. Contact us when done.",
    after:
      "Read https://agent-control.net and write a short FAQ (8–12 Q&As) in plain English covering: free job posts, free agent listings, how pay works today (agree with the worker; pay-through-us not live), and how to apply. Deliver as markdown. Contact us when done.",
  },
];

const PAY_WHEN_DONE =
  /pay only when|paid when|when the job is done|pay-when-done|pay when done|escrow|we hold|hold the money|refund/i;

describe("0044 exchange jobs direct-pay copy", () => {
  async function withLiveJobs() {
    const { db, sql } = await openDb();
    for (const job of LIVE_JOBS) {
      await db.query(
        `insert into exchange_jobs (id, title, summary, poster_kind, amount_usdc, deadline_at, contact, created_at)
         values ($1, $2, $3, 'human', 25, '2026-10-19T23:59:59.999Z', 'support@agent-control.net', '2026-10-06T04:54:40.385Z')`,
        [job.id, job.title, job.before],
      );
    }
    return { db, sql };
  }

  async function rows(db: PGlite) {
    const result = await db.query<Record<string, unknown>>(
      "select * from exchange_jobs order by id",
    );
    return result.rows;
  }

  it("covers every live line with pay-when-done, escrow, or refund wording", () => {
    const flagged = LIVE_JOBS.filter((job) => PAY_WHEN_DONE.test(job.before));
    assert.equal(flagged.length, 8);
    assert.equal(
      LIVE_JOBS.filter((job) => job.before.endsWith("Paid when we say it's done.")).length,
      5,
    );
  });

  it("lands the direct-pay text, changes only summary, and is idempotent", async () => {
    const { db } = await withLiveJobs();
    const before = await rows(db);
    await db.exec(DIRECT_PAY);
    const after = await rows(db);
    for (const job of LIVE_JOBS) {
      const row = after.find((r) => r.id === job.id);
      assert.equal(row?.summary, job.after, job.id);
      assert.doesNotMatch(String(row?.summary), PAY_WHEN_DONE, job.id);
    }
    assert.deepEqual(
      after.map((r) => ({ ...r, summary: null })),
      before.map((r) => ({ ...r, summary: null })),
    );
    assert.equal(
      after.filter((r) =>
        String(r.summary).endsWith(" We pay directly in USDC once we accept the work."),
      ).length,
      5,
    );
    await db.exec(DIRECT_PAY);
    assert.deepEqual(await rows(db), after);
  });

  it("skips rows whose text no longer matches exactly, and other jobs", async () => {
    const { db } = await withLiveJobs();
    const edited = "Edited by hand since. Paid when we say it's done!";
    await db.query("update exchange_jobs set summary = $1 where id = $2", [
      edited,
      LIVE_JOBS[0]?.id,
    ]);
    await db.query(
      `insert into exchange_jobs (id, title, summary, poster_kind, amount_usdc, deadline_at, contact)
       values ('job_outside', 'Outside', 'Paid when we say it''s done.', 'agent', 5, '2026-10-19T23:59:59.999Z', 'ada@example.com')`,
    );
    await db.exec(DIRECT_PAY);
    const after = await rows(db);
    assert.equal(after.find((r) => r.id === LIVE_JOBS[0]?.id)?.summary, edited);
    assert.equal(after.find((r) => r.id === "job_outside")?.summary, "Paid when we say it's done.");
  });

  it("keeps a row that already has the new text unchanged", async () => {
    const { db } = await withLiveJobs();
    await db.exec(DIRECT_PAY);
    const once = await rows(db);
    await db.exec(DIRECT_PAY);
    assert.deepEqual(await rows(db), once);
  });
});
