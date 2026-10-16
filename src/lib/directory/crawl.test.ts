import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  AGENTS_TXT_LISTING_LIMIT,
  buildAgentsJson,
  buildAgentsTxt,
  buildSitemapXml,
  jsonLdScript,
  listingJsonLd,
  listingPageHead,
  toDiscoveryListing,
} from "./crawl.ts";
import {
  createListing,
  hashClientIp,
  listVisibleListings,
  type ListingQuery,
} from "./listings.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = readFileSync(join(ROOT, "migrations/0027_agent_listings.sql"), "utf8");
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

describe("directory crawl output", () => {
  it("mentions the directory in llms.txt", () => {
    const llms = read("public/llms.txt");
    assert.match(llms, /https:\/\/agent-control\.net\/directory/);
    assert.match(llms, /https:\/\/agent-control\.net\/directory\/<id>/);
    assert.match(llms, /agents\.json include those pages/);
  });

  it("omits endpoint when the listing has no link and escapes json-ld", () => {
    const plain = toDiscoveryListing({
      id: "agent_aaaaaaaaaaaaaaaaaaaaaaaa",
      name: "Plain",
      pitch: "A note.",
      contact: "plain@example.com",
      link: null,
    });
    assert.equal(plain.url, "https://agent-control.net/directory/agent_aaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal("endpoint" in plain, false);

    const linkedFields = {
      id: "agent_bbbbbbbbbbbbbbbbbbbbbbbb",
      name: "Linked",
      pitch: "Uses <script> tags. Listed from public registry - unclaimed.",
      contact: "https://example.com/linked",
      link: "https://example.com/linked",
    };
    const linked = toDiscoveryListing(linkedFields);
    assert.equal(linked.endpoint, "https://example.com/linked");
    assert.equal(linked.pitch, "Uses <script> tags.");

    const script = jsonLdScript(listingJsonLd(linkedFields));
    assert.doesNotMatch(script, /<script/);
    assert.match(script, /\\u003cscript/);
    const parsed = JSON.parse(script) as { "@type": string; name: string; url: string; sameAs: string };
    assert.equal(parsed["@type"], "SoftwareApplication");
    assert.equal(parsed.name, "Linked");
    assert.equal(parsed.url, linked.url);
    assert.equal(parsed.sameAs, "https://example.com/linked");

    const head = listingPageHead(linkedFields);
    assert.equal(head.meta.find((item) => "title" in item)?.title, "Linked — Agent Control");
    assert.equal(
      head.meta.find((item) => item.name === "description")?.content,
      "Uses <script> tags.",
    );
    assert.equal(head.links?.[0]?.rel, "canonical");
    assert.equal(head.links?.[0]?.href, linked.url);
  });

  it("adds visible listings to the sitemap and agents.json and leaves hidden ones out", async () => {
    const db = new PGlite();
    await db.exec(MIGRATION);
    const sql = wrap(db);
    const visible = await createListing(sql, listing(), NOW, hashClientIp("203.0.113.10"));
    const hidden = await createListing(
      sql,
      listing({
        name: "Smoke probe",
        pitch: "A migrate probe that must stay off the public list.",
        link: "https://example.com/smoke",
      }),
      new Date(NOW.getTime() + 1000),
      hashClientIp("203.0.113.11"),
    );
    await db.query("update agent_listings set hidden_at = now() where id = $1", [hidden.id]);

    const rows = await listVisibleListings(sql, NOW);
    assert.deepEqual(
      rows.map((row) => row.id),
      [visible.id],
    );

    const staticSitemap = read("public/sitemap.xml");
    const sitemap = buildSitemapXml(staticSitemap, rows);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/directory<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/privacy<\/loc>/);
    assert.match(
      sitemap,
      new RegExp(
        `<loc>https://agent-control\\.net/directory/${visible.id}</loc>\\s*<lastmod>2026-10-05</lastmod>`,
      ),
    );
    assert.doesNotMatch(sitemap, new RegExp(hidden.id));
    assert.doesNotMatch(sitemap, /Smoke probe/);

    const discovery = rows.map((row) => toDiscoveryListing(row));
    const agents = JSON.parse(buildAgentsJson(read("public/agents.json"), discovery)) as {
      site: { name: string; url: string };
      skills: unknown[];
      listings: Array<{ id: string; name: string; pitch: string; url: string; endpoint?: string }>;
    };
    assert.equal(agents.site.name, "Agent Control");
    assert.equal(agents.site.url, "https://agent-control.net");
    assert.ok(agents.skills.length >= 1);
    assert.equal(agents.listings.length, 1);
    assert.deepEqual(agents.listings[0], {
      id: visible.id,
      name: "Ada",
      pitch: "I read the tickets and write a short note.",
      url: `https://agent-control.net/directory/${visible.id}`,
      endpoint: "https://example.com/ada",
    });

    const txt = buildAgentsTxt(read("public/agents.txt"), discovery);
    assert.match(txt, /^# agents\.txt\n/);
    assert.match(txt, /https:\/\/agent-control\.net\/agents\.json/);
    assert.match(txt, /https:\/\/agent-control\.net\/directory\n/);
    assert.match(txt, new RegExp(`Ada — I read the tickets and write a short note\\. — https://agent-control\\.net/directory/${visible.id}`));
    assert.doesNotMatch(txt, /Smoke probe/);
    assert.ok(AGENTS_TXT_LISTING_LIMIT < 100);
  });
});
