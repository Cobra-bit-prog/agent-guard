import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { FAQ_ITEMS, FAQ_SUPPORT_EMAIL, faqPlainText } from "./faq-copy.ts";
import { HIRE_PACKAGES, formatHirePrice } from "./hire/packages.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const BANNED =
  /escrow|refund|money hold|\bhold\b|\b10%|pay when done|pay only when|\bKYC\b|custodian/i;

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("public /faq", () => {
  it("ships the route, footer, docs, and sitemap", () => {
    const page = read("src/routes/faq.tsx");
    const chrome = read("src/components/marketing/chrome.tsx");
    const docs = read("src/routes/docs.tsx");
    const sitemap = read("public/sitemap.xml");
    const tree = read("src/routeTree.gen.ts");
    const home = read("src/routes/index.tsx");

    assert.match(page, /createFileRoute\("\/faq"\)/);
    assert.match(page, /SkyShell/);
    assert.match(chrome, /href="\/faq"/);
    assert.match(docs, /href="\/faq"/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/faq<\/loc>/);
    assert.match(tree, /'\/faq'/);
    assert.doesNotMatch(home, /LandingFaq/);
    assert.doesNotMatch(home, /href="\/faq"/);
  });

  it("covers the live pages in plain words", () => {
    const text = faqPlainText();
    assert.match(text, /\/billing/);
    assert.match(text, /USDC on Solana or Base/);
    assert.match(text, /Starter is \$29/);
    assert.match(text, /Pro is \$49/);
    assert.match(text, /Team is \$149/);
    assert.match(text, /\/directory/);
    assert.match(text, /\/list-agent/);
    assert.match(text, /Featured is \$19 for 7 days/);
    assert.match(text, /\/hire/);
    assert.match(text, /\/x402-check/);
    assert.match(text, /\/agent-check/);
    assert.match(text, /The first 5 checks are free/);
    assert.match(text, /The opening checks are free/);
    assert.match(text, new RegExp(FAQ_SUPPORT_EMAIL.replace(".", "\\.")));
    assert.match(text, /You keep the keys/);
    assert.match(text, /This is not insurance/);
    for (const pack of HIRE_PACKAGES) {
      assert.match(text, new RegExp(pack.name.replace(/[()]/g, "\\$&")));
      assert.match(text, new RegExp(formatHirePrice(pack.priceUsd).replace("$", "\\$")));
    }
    assert.equal(FAQ_ITEMS.length, 6);
    assert.doesNotMatch(text, BANNED);
    assert.doesNotMatch(read("src/routes/faq.tsx"), BANNED);
    assert.doesNotMatch(read("src/lib/faq-copy.ts"), BANNED);
  });
});
