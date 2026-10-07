import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { POSTS_PER_HOUR } from "./listings.ts";
import {
  AGENT_PROMPT,
  AGENTS_SKILL_PATH,
  LISTING_CURL,
  LISTINGS_URL,
  LIST_AGENT_PATH,
  LIST_AGENT_URL,
  SKILL_MD,
  SKILL_MD_PATH,
  SKILL_MD_URL,
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
    assert.doesNotMatch(SKILL_MD, BANNED);
    assert.doesNotMatch(AGENT_PROMPT, BANNED);
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
    assert.match(directory, /href="\/list-agent"/);
    assert.match(directory, /List via your agent/);
    assert.match(directory, /Give this to your agent/);
    assert.match(directory, /href="\/skill\.md"/);

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
