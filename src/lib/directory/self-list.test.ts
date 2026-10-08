import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { POSTS_PER_HOUR } from "./listings.ts";
import { FEATURED_STARTS_PER_HOUR } from "./featured-copy.ts";
import { PAY_EXPIRY_MS } from "../solana-pay.ts";
import {
  AGENT_PROMPT,
  AGENTS_SKILL_PATH,
  FEATURED_INVOICE_EXAMPLE,
  FEATURED_PRICE_EXAMPLE,
  FEATURED_URL,
  LISTING_CURL,
  LISTINGS_URL,
  LIST_AGENT_PATH,
  LIST_AGENT_URL,
  SELF_LIST,
  SELF_LIST_LINK_LABEL,
  SKILL_MD,
  SKILL_MD_PATH,
  SKILL_MD_URL,
  listingsPayload,
} from "./self-list.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const BANNED = /escrow|refund|keep 10%|pay only when|\bhold\b|\bHOLD\b|honeypot|company_website/i;

describe("self-list skill", () => {
  it("serves the same skill.md an agent can fetch and follow", () => {
    assert.equal(read("public/skill.md"), SKILL_MD);
    assert.match(SKILL_MD, /^---\nname: list-on-agent-control\n/);
    assert.match(SKILL_MD, new RegExp(SKILL_MD_URL.replaceAll(".", "\\.")));
    assert.match(SKILL_MD, new RegExp(`POST ${LISTINGS_URL.replaceAll(".", "\\.")}`));
    assert.ok(SKILL_MD.includes(LISTING_CURL));
    assert.match(SKILL_MD, /name \(required\)/);
    assert.match(SKILL_MD, /skills \(required\)/);
    assert.match(SKILL_MD, /pitch \(required\)/);
    assert.match(SKILL_MD, /contact \(required\)/);
    assert.match(SKILL_MD, /link \(optional\)/);
    assert.match(SKILL_MD, /80 characters or less/);
    assert.match(SKILL_MD, /1 to 8 skills/);
    assert.match(SKILL_MD, /32 characters or less/);
    assert.match(SKILL_MD, /280 characters or less/);
    assert.match(SKILL_MD, /200 characters or less/);
    assert.match(SKILL_MD, /500 characters or less/);
    assert.match(SKILL_MD, /HTTP 201/);
    assert.match(SKILL_MD, /HTTP 400/);
    assert.match(SKILL_MD, /HTTP 429/);
    assert.match(SKILL_MD, new RegExp(`${POSTS_PER_HOUR} listings per hour`));
    assert.match(SKILL_MD, /Too many posts from this network\. Try again later\./);
    assert.match(SKILL_MD, /Listing is free/);
    assert.match(SKILL_MD, /\$19 USDC for 7 days/);
    assert.match(SKILL_MD, /No API key/);
    assert.match(SKILL_MD, /## 2\. Optional: get featured/);
    assert.match(SKILL_MD, new RegExp(`POST ${FEATURED_URL.replaceAll(".", "\\.")}`));
    assert.match(SKILL_MD, /HTTP 402/);
    assert.match(SKILL_MD, /GET returns HTTP 200/);
    assert.match(SKILL_MD, /does not return HTTP 402/);
    assert.ok(SKILL_MD.includes(JSON.stringify(FEATURED_PRICE_EXAMPLE)));
    assert.ok(SKILL_MD.includes(JSON.stringify(FEATURED_INVOICE_EXAMPLE)));
    assert.match(SKILL_MD, /listing_id/);
    assert.match(SKILL_MD, /invoice_id/);
    assert.match(SKILL_MD, /Base or Solana/);
    assert.match(
      SKILL_MD,
      new RegExp(`${FEATURED_STARTS_PER_HOUR} payment starts per hour`),
    );
    assert.match(SKILL_MD, new RegExp(`The invoice lasts ${PAY_EXPIRY_MS / 60_000} minutes`));
    assert.match(SKILL_MD, /Contact does not match this listing\./);
    assert.match(SKILL_MD, /This payment window closed\. Start again\./);
    assert.match(SKILL_MD, /The payment was short of \$19 USDC/);
    assert.doesNotMatch(SKILL_MD, BANNED);
    assert.doesNotMatch(AGENT_PROMPT, BANNED);
    const listed = listingsPayload({ listings: [{ id: "agent_x" }] });
    assert.equal(listed.self_list.skill_md, SKILL_MD_URL);
    assert.equal(listed.self_list.post, LISTINGS_URL);
    assert.equal(listed.self_list.list_agent, LIST_AGENT_URL);
    assert.deepEqual(listed.self_list, SELF_LIST);
    assert.equal(listed.listings[0]?.id, "agent_x");
  });

  it("points humans at one short note and keeps discovery files on the same path", () => {
    assert.match(AGENT_PROMPT, new RegExp(SKILL_MD_URL.replaceAll(".", "\\.")));
    assert.match(AGENT_PROMPT, /Listing is free/);
    assert.equal(SKILL_MD_PATH, "/skill.md");
    assert.equal(LIST_AGENT_PATH, "/list-agent");
    assert.equal(AGENTS_SKILL_PATH, "/agents/skill.md");

    const page = read("src/routes/list-agent.tsx");
    assert.match(page, /AGENT_PROMPT/);
    assert.match(page, /LISTING_CURL/);
    assert.match(page, /Give this to your agent/);
    assert.match(page, /Feature a listing \(\$19 \/ 7 days\)/);
    assert.match(page, /20 listings an hour/);
    assert.doesNotMatch(page, BANNED);

    const directory = read("src/routes/directory.tsx");
    const note = read("src/components/self-list-note.tsx");
    const listingPage = read("src/routes/directory_.$id.tsx");
    const listingsApi = read("src/routes/api/v1/agents.listings.ts");
    assert.match(directory, /SelfListNote/);
    assert.match(directory, /listingPagePath/);
    assert.match(listingPage, /SelfListNote/);
    assert.match(listingPage, /Feature this listing \(\$19 \/ 7 days\)/);
    assert.equal(SELF_LIST_LINK_LABEL, "List your agent — give this to your agent");
    assert.match(note, /SELF_LIST_LINK_LABEL/);
    assert.match(note, /href="\/list-agent"/);
    assert.match(note, /href=\{SKILL_MD_PATH\}/);
    assert.match(note, />\s*\/skill\.md\s*</);
    assert.match(listingsApi, /listingsPayload/);
    assert.doesNotMatch(listingsApi, /return json\(\{/);
    assert.doesNotMatch(note, BANNED);
    assert.doesNotMatch(listingPage, BANNED);
    assert.doesNotMatch(
      listingPage,
      /featured_7d|escrow|refund|\bhold\b|\bsignature\b|\bprotocol\b|\brail\b/i,
    );

    const home = read("src/routes/index.tsx");
    assert.match(home, /href="\/list-agent"/);
    assert.match(home, /Give this to your agent/);
    assert.match(home, /href="\/directory#featured"/);

    const llms = read("public/llms.txt");
    assert.match(llms, new RegExp(LIST_AGENT_URL.replaceAll(".", "\\.")));
    assert.match(llms, new RegExp(SKILL_MD_URL.replaceAll(".", "\\.")));
    assert.match(
      llms,
      /List your agent free: POST \/api\/v1\/agents\/listings with name, skills, pitch, contact\. Browse: GET \/api\/v1\/agents\/listings\.\s*$/,
    );

    const agents = read("public/agents.txt");
    assert.match(agents, new RegExp(LIST_AGENT_URL.replaceAll(".", "\\.")));
    assert.match(agents, new RegExp(SKILL_MD_URL.replaceAll(".", "\\.")));
    assert.ok(agents.indexOf(SKILL_MD_URL) < agents.indexOf("Can I pay this address?"));

    const json = read("public/agents.json");
    assert.equal(read("public/.well-known/agents.json"), json);
    assert.match(json, new RegExp(SKILL_MD_URL.replaceAll(".", "\\.")));
    assert.match(json, new RegExp(LIST_AGENT_URL.replaceAll(".", "\\.")));

    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const vercel = read("vercel.json");
    assert.match(robots, /Allow: \/skill\.md/);
    assert.match(robots, /Allow: \/list-agent/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/skill\.md<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/list-agent<\/loc>/);
    assert.match(vercel, /"source": "\/skill\.md"/);
    assert.match(vercel, /text\/markdown; charset=utf-8/);
  });
});
