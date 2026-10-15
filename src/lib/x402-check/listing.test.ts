import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { createListing, type ListingQuery, parseListing } from "../directory/listings.ts";
import {
  LISTINGS_URL,
  X402_ORG_CLOSED_ISSUE,
  X402_ORG_CLOSED_LINE,
} from "../directory/self-list.ts";
import { BASE_USDC } from "../meter/accepts.ts";
import { USDC_MINT } from "../solana-pay.ts";
import { handleX402CheckRequest } from "./http.ts";
import { listingDraftFromPayment } from "./listing-draft.ts";
import type { ProbeTransport } from "./probe.ts";
import { runListingCheck } from "./run.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const LISTINGS = readFileSync(join(ROOT, "migrations/0027_agent_listings.sql"), "utf8");
const ORDERS = readFileSync(join(ROOT, "migrations/0038_x402_check_orders.sql"), "utf8");
const URL = "https://api.example.com/v1/yield";
const PAY_BASE = "0x48d5A78d480B4C32dE319C2aEF69e682Dc304615";
const PAY_SOL = "9CAhY1vdaZfrfoto3KLQtRAo1dVWxNn5xAfmc2XbZVsf";
const NOW = new Date("2026-10-15T12:00:00.000Z");

function wrap(db: PGlite): ListingQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    x402Version: 2,
    resource: {
      url: URL,
      description: "USDC yield",
      mimeType: "application/json",
      serviceName: "USDC yield",
      tags: ["usdc", "yield"],
    },
    accepts: [
      {
        scheme: "exact",
        network: "base",
        amount: "10000",
        asset: BASE_USDC,
        payTo: PAY_BASE,
        maxTimeoutSeconds: 60,
      },
      {
        scheme: "exact",
        network: "solana",
        amount: "10000",
        asset: USDC_MINT,
        payTo: PAY_SOL,
        maxTimeoutSeconds: 60,
      },
    ],
    extensions: {
      bazaar: {
        info: { input: { type: "http", method: "GET" }, output: { type: "json" } },
        schema: { type: "object" },
      },
    },
    ...overrides,
  };
}

function transportFor(body: unknown, status = 402): ProbeTransport {
  return async () => ({
    status,
    headers: { get: () => null },
    body: Buffer.from(JSON.stringify(body)),
  });
}

const publicLookup = async () => ["1.1.1.1"];

function post(body: unknown, ip = "203.0.113.81") {
  return new Request("https://agent-control.net/api/v1/x402-check", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("x402 listing prefill", () => {
  it("maps a full 402 into a directory listing", () => {
    const draft = listingDraftFromPayment(payment(), URL);
    assert.ok(draft);
    assert.equal(draft.name, "USDC yield");
    assert.equal(draft.description, "USDC yield");
    assert.equal(draft.price, "0.01");
    assert.equal(draft.network, "base");
    assert.equal(draft.pay_to, PAY_BASE);
    assert.equal(draft.endpoint_url, URL);
    assert.deepEqual(draft.skills, ["usdc", "yield"]);
    assert.equal(draft.contact, URL);
    assert.equal(draft.post, LISTINGS_URL);
    assert.equal(draft.existing, null);
    assert.equal(draft.body.link, URL);
    assert.match(draft.body.pitch, /USDC yield/);
    assert.match(draft.body.pitch, /\$0\.01 USDC on base/);
    assert.match(draft.body.pitch, new RegExp(PAY_BASE));
    assert.deepEqual(parseListing(draft.body), {
      name: draft.body.name,
      skills: draft.body.skills,
      pitch: draft.body.pitch,
      contact: draft.body.contact,
      link: draft.body.link,
    });

    const named = listingDraftFromPayment(
      payment({
        extensions: {
          bazaar: {
            info: {
              name: "Bazaar desk",
              description: "Prices from the bazaar extension.",
              tags: ["bazaar"],
            },
            schema: { type: "object" },
          },
        },
      }),
      URL,
    );
    assert.equal(named?.name, "Bazaar desk");
    assert.equal(named?.description, "Prices from the bazaar extension.");
    assert.deepEqual(named?.skills, ["bazaar"]);
  });

  it("fills gaps when the 402 omits name, description, price, network, and payTo", () => {
    const draft = listingDraftFromPayment({ x402Version: 2, accepts: [{}] }, URL);
    assert.ok(draft);
    assert.equal(draft.name, "api.example.com");
    assert.equal(draft.description, "Paid x402 endpoint.");
    assert.equal(draft.price, null);
    assert.equal(draft.network, null);
    assert.equal(draft.pay_to, null);
    assert.equal(draft.endpoint_url, URL);
    assert.deepEqual(draft.skills, ["x402"]);
    assert.equal(draft.contact, URL);
    assert.equal(draft.post, LISTINGS_URL);
    assert.equal(draft.body.pitch, "Paid x402 endpoint.");
    assert.equal(draft.body.link, URL);
    parseListing(draft.body);
  });

  it("truncates an overlong description to the listing pitch limit", () => {
    const long = "d".repeat(500);
    const draft = listingDraftFromPayment(
      payment({
        resource: {
          url: URL,
          description: long,
          mimeType: "application/json",
          serviceName: "N".repeat(100),
          tags: ["t".repeat(40), "usdc", "usdc", 12, "yield"],
        },
      }),
      URL,
    );
    assert.ok(draft);
    assert.equal(draft.name.length, 80);
    assert.equal(draft.name, "N".repeat(80));
    assert.equal(draft.description.length, 280);
    assert.equal(draft.description, "d".repeat(280));
    assert.equal(draft.body.pitch.length, 280);
    assert.equal(draft.body.pitch, "d".repeat(280));
    assert.equal(draft.skills[0]?.length, 32);
    assert.ok(draft.skills.length <= 8);
    assert.equal(draft.skills.filter((skill) => skill.toLowerCase() === "usdc").length, 1);
    parseListing(draft.body);
  });
});

describe("x402 check listing object", () => {
  it("returns the prefill on the free check and keeps the old fields", async () => {
    const response = await handleX402CheckRequest(
      post({ url: URL }, "203.0.113.81"),
      null,
      {
        runFree: (target) =>
          runListingCheck(target, "free", {
            lookup: publicLookup,
            transport: transportFor(payment()),
          }),
      },
      NOW,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      product: string;
      tier: string;
      summary: string;
      checks: Array<{ id: string }>;
      caveat: string;
      listing: {
        name: string;
        description: string;
        price: string | null;
        network: string | null;
        pay_to: string | null;
        endpoint_url: string | null;
        post: string;
        body: { pitch: string; contact: string; link: string | null };
        existing: null;
      };
      next: { hire: { href: string }; directory: { href: string }; report: { price_usd: number } };
    };
    assert.equal(body.product, "x402_listing_check");
    assert.equal(body.tier, "free");
    assert.ok(body.summary);
    assert.ok(body.checks.length > 0);
    assert.match(body.caveat, /Coinbase/);
    assert.equal(body.next.hire.href, "/hire");
    assert.equal(body.next.directory.href, "/directory");
    assert.equal(body.next.report.price_usd, 19);
    assert.equal(body.listing.name, "USDC yield");
    assert.equal(body.listing.description, "USDC yield");
    assert.equal(body.listing.price, "0.01");
    assert.equal(body.listing.network, "base");
    assert.equal(body.listing.pay_to, PAY_BASE);
    assert.equal(body.listing.endpoint_url, URL);
    assert.equal(body.listing.post, LISTINGS_URL);
    assert.equal(body.listing.body.link, URL);
    assert.equal(body.listing.body.contact, URL);
    assert.equal(body.listing.existing, null);
    parseListing(body.listing.body);
  });

  it("returns listing null when the reply is not a decoded 402", async () => {
    const response = await handleX402CheckRequest(
      post({ url: URL }, "203.0.113.82"),
      null,
      {
        runFree: (target) =>
          runListingCheck(target, "free", {
            lookup: publicLookup,
            transport: transportFor({ ok: true }, 200),
          }),
      },
      NOW,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      listing: unknown;
      checks: unknown[];
      summary: string;
    };
    assert.equal(body.listing, null);
    assert.ok(body.checks.length > 0);
    assert.ok(body.summary);
  });

  it("points at the existing listing instead of a second prefill post", async () => {
    const db = new PGlite();
    await db.exec(LISTINGS);
    await db.exec(ORDERS);
    const sql = wrap(db);
    const row = await createListing(
      sql,
      {
        name: "Yield desk",
        skills: "x402",
        pitch: "Already on the directory.",
        contact: URL,
        link: URL,
      },
      NOW,
      "ip-hash",
    );
    const response = await handleX402CheckRequest(
      post({ url: URL }, "203.0.113.83"),
      sql,
      {
        runFree: (target, dbSql) =>
          runListingCheck(target, "free", {
            lookup: publicLookup,
            transport: transportFor(payment()),
            sql: dbSql,
          }),
      },
      NOW,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      listing: {
        post: string;
        existing: { id: string; name: string; href: string; line: string } | null;
      };
    };
    assert.equal(body.listing.post, LISTINGS_URL);
    assert.equal(body.listing.existing?.id, row.id);
    assert.equal(body.listing.existing?.name, "Yield desk");
    assert.equal(body.listing.existing?.href, `https://agent-control.net/directory/${row.id}`);
    assert.match(body.listing.existing?.line ?? "", /already listed/i);
    const rows = await db.query<{ n: string }>("select count(*)::text as n from agent_listings");
    assert.equal(rows.rows[0]?.n, "1");
  });
});

describe("x402.org closed line", () => {
  it("is on the directory self-list section, skill.md, and llms.txt", () => {
    const directory = readFileSync(join(ROOT, "src/routes/directory.tsx"), "utf8");
    const skill = readFileSync(join(ROOT, "public/skill.md"), "utf8");
    const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
    const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
    assert.match(directory, /X402_ORG_CLOSED_LINE/);
    assert.match(directory, /X402_ORG_CLOSED_ISSUE/);
    for (const file of [skill, llms]) {
      assert.ok(file.includes(X402_ORG_CLOSED_LINE));
      assert.ok(file.includes(X402_ORG_CLOSED_ISSUE));
    }
    assert.equal(home.includes(X402_ORG_CLOSED_LINE), false);
    assert.equal(home.includes("X402_ORG_CLOSED_LINE"), false);
    assert.match(
      llms,
      /List your agent free: POST \/api\/v1\/agents\/listings with name, skills, pitch, contact\. Browse: GET \/api\/v1\/agents\/listings\.\s*$/,
    );
  });
});
