import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { SEED_JOB_CONTACT, isSeedJob, splitJobBoardStats } from "../exchange/seed-jobs.ts";
import type { ListingQuery } from "../exchange/listings.ts";
import { meterInvoiceSourceForMcpTool } from "../meter/origin.ts";
import { MCP_MARKETPLACE_TOOLS, MCP_TOOLS } from "../mcp/tools.ts";
import { isWriteGateTool } from "../write-gate.ts";
import { runMarketplaceTool } from "./marketplace-mcp.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const NOW = new Date("2026-10-06T12:00:00.000Z");

function wrap(db: PGlite): ListingQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

async function openDb(): Promise<ListingQuery> {
  const db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "migrations/0025_exchange_jobs.sql"), "utf8"));
  await db.exec(readFileSync(join(ROOT, "migrations/0027_agent_listings.sql"), "utf8"));
  return wrap(db);
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    title: "Summarize the support tickets",
    summary: "Read the last twenty tickets and write a one-page note.",
    budget_usd: 40,
    deadline: "2026-10-20",
    poster_kind: "agent",
    contact: "ada@example.com",
    ...overrides,
  };
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada",
    skills: ["research", "writing"],
    pitch: "I read the tickets and write a short note.",
    contact: "ada@example.com",
    ...overrides,
  };
}

const headers = new Headers({ "cf-connecting-ip": "203.0.113.50" });

describe("free marketplace MCP tools", () => {
  it("lists open jobs, posts one, and does not ask for a Meter look or an Action Gate seat", async () => {
    const sql = await openDb();
    const empty = await runMarketplaceTool("list_open_jobs", {}, { sql, now: NOW, headers });
    assert.equal(empty?.ok, true);
    if (!empty?.ok) return;
    assert.deepEqual(empty.result, { jobs: [] });

    const posted = await runMarketplaceTool("post_job", job(), { sql, now: NOW, headers });
    assert.equal(posted?.ok, true);
    if (!posted?.ok) return;
    const body = posted.result as {
      job: { id: string; title: string; budget_usd: number; contact: string };
    };
    assert.equal(body.job.title, "Summarize the support tickets");
    assert.equal(body.job.budget_usd, 40);
    assert.equal(body.job.contact, "ada@example.com");
    assert.equal(isSeedJob(body.job), false);

    const listed = await runMarketplaceTool("list_open_jobs", {}, { sql, now: NOW, headers });
    assert.equal(listed?.ok, true);
    if (!listed?.ok) return;
    const jobs = (listed.result as { jobs: { id: string; contact: string }[] }).jobs;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.id, body.job.id);
    assert.deepEqual(splitJobBoardStats(jobs), { open: 1, outside: 1, seed: 0 });
  });

  it("leaves a hidden post off list_open_jobs and returns it to the poster", async () => {
    const sql = await openDb();
    const posted = await runMarketplaceTool(
      "post_job",
      job({ title: "Quiet check", hidden: true }),
      { sql, now: NOW, headers },
    );
    assert.equal(posted?.ok, true);
    if (!posted?.ok) return;
    const body = posted.result as { job: { id: string; title: string; hidden?: boolean } };
    assert.equal(body.job.title, "Quiet check");
    assert.equal(body.job.hidden, true);

    const listed = await runMarketplaceTool("list_open_jobs", {}, { sql, now: NOW, headers });
    assert.equal(listed?.ok, true);
    if (!listed?.ok) return;
    assert.deepEqual(listed.result, { jobs: [] });
  });

  it("keeps a support@ post on the board and marks it as a seed for the scoreboard", async () => {
    const sql = await openDb();
    const posted = await runMarketplaceTool(
      "post_job",
      job({ contact: SEED_JOB_CONTACT, title: "Our smoke post" }),
      { sql, now: NOW, headers },
    );
    assert.equal(posted?.ok, true);
    if (!posted?.ok) return;
    const listed = await runMarketplaceTool("list_open_jobs", {}, { sql, now: NOW });
    assert.equal(listed?.ok, true);
    if (!listed?.ok) return;
    const jobs = (listed.result as { jobs: { id: string; contact: string }[] }).jobs;
    assert.equal(jobs.length, 1);
    assert.equal(isSeedJob(jobs[0] ?? { id: "" }), true);
    assert.deepEqual(splitJobBoardStats(jobs), { open: 1, outside: 0, seed: 1 });
  });

  it("lists an agent and browses the directory with no API key", async () => {
    const sql = await openDb();
    const created = await runMarketplaceTool("list_your_agent", agent(), {
      sql,
      now: NOW,
      headers,
    });
    assert.equal(created?.ok, true);
    if (!created?.ok) return;
    const listing = (created.result as { listing: { name: string; skills: string[] } }).listing;
    assert.equal(listing.name, "Ada");
    assert.deepEqual(listing.skills, ["research", "writing"]);

    const browsed = await runMarketplaceTool("browse_agents", {}, { sql, now: NOW });
    assert.equal(browsed?.ok, true);
    if (!browsed?.ok) return;
    const listings = (browsed.result as { listings: { name: string }[] }).listings;
    assert.deepEqual(
      listings.map((row) => row.name),
      ["Ada"],
    );
  });

  it("returns the public validation error and does not store a honeypot", async () => {
    const sql = await openDb();
    const missing = await runMarketplaceTool("post_job", job({ title: " " }), { sql, now: NOW });
    assert.equal(missing?.ok, false);
    if (!missing || missing.ok) return;
    assert.equal(missing.status, 400);
    assert.equal(missing.message, "Title is required");

    const spam = await runMarketplaceTool(
      "post_job",
      job({ company_website: "https://spam.example" }),
      { sql, now: NOW },
    );
    assert.equal(spam?.ok, false);
    if (!spam || spam.ok) return;
    assert.equal(spam.message, "Could not post this job.");

    const listed = await runMarketplaceTool("list_open_jobs", {}, { sql, now: NOW });
    assert.equal(listed?.ok, true);
    if (!listed?.ok) return;
    assert.deepEqual(listed.result, { jobs: [] });
  });

  it("says the board is missing when the table is not there yet", async () => {
    const sql: ListingQuery = {
      async query() {
        const err = new Error('relation "exchange_jobs" does not exist');
        Object.assign(err, { code: "42P01" });
        throw err;
      },
    };
    const jobs = await runMarketplaceTool("list_open_jobs", {}, { sql, now: NOW });
    assert.equal(jobs?.ok, false);
    if (!jobs || jobs.ok) return;
    assert.equal(jobs.status, 503);
    assert.equal(jobs.message, "Job board is not on this database yet.");

    const agents = await runMarketplaceTool("browse_agents", {}, { sql, now: NOW });
    assert.equal(agents?.ok, false);
    if (!agents || agents.ok) return;
    assert.equal(agents.status, 503);
    assert.equal(agents.message, "Agent directory is not on this database yet.");
  });

  it("ignores unknown tool names", async () => {
    const sql: ListingQuery = {
      async query() {
        throw new Error("should not query");
      },
    };
    assert.equal(await runMarketplaceTool("meter_scan", {}, { sql, now: NOW }), null);
    assert.equal(await runMarketplaceTool("check_action", {}, { sql, now: NOW }), null);
  });

  it("describes a free board and does not claim escrow, refunds, or live pay-through-us", () => {
    const tools = MCP_MARKETPLACE_TOOLS.map((name) => MCP_TOOLS.find((tool) => tool.name === name));
    assert.equal(tools.length, 4);
    const text = tools.map((tool) => tool?.description ?? "").join("\n");
    assert.match(text, /Free job board/);
    assert.match(text, /Posting costs nothing/);
    assert.match(text, /Featured is \$19 for 7 days/);
    assert.match(text, /Hire paths pay us directly/);
    assert.doesNotMatch(text, /Pay only when|when the job is done|Paying through Agent Control is not live/i);
    assert.match(text, /Listing your agent is free/);
    assert.match(text, /No API key/);
    assert.match(text, /No Meter look/);
    assert.match(text, /No Action Gate seat/);
    assert.match(text, /GET \/api\/v1\/exchange\/jobs/);
    assert.match(text, /POST \/api\/v1\/exchange\/jobs/);
    assert.match(text, /POST \/api\/v1\/agents\/listings/);
    assert.match(text, /GET \/api\/v1\/agents\/listings/);
    assert.doesNotMatch(text, /escrow|refund|keep 10%/i);
    assert.doesNotMatch(text, /pay through us is live/i);

    for (const name of MCP_MARKETPLACE_TOOLS) {
      assert.equal(meterInvoiceSourceForMcpTool(name), undefined);
      assert.equal(isWriteGateTool(name), false);
    }

    const dispatch = readFileSync(join(ROOT, "src/lib/server/mcp-dispatch.ts"), "utf8");
    assert.ok(
      dispatch.indexOf("isMarketplaceMcpTool") < dispatch.indexOf('name === "meter_pricing"'),
    );
    const handler = readFileSync(join(ROOT, "src/lib/server/marketplace-mcp.ts"), "utf8");
    assert.doesNotMatch(handler, /handleMeterRequest|checkActionIntent|Action Gate seat required/);
  });
});
