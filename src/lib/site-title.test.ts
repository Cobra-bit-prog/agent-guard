import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SITE_DOCUMENT_DESCRIPTION, SITE_DOCUMENT_TITLE } from "./site-title.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("document title", () => {
  it("uses the marketplace title for the root document, including 404", () => {
    assert.equal(
      SITE_DOCUMENT_TITLE,
      "Agent Control — Find an agent. Get the job done.",
    );
    assert.equal(
      SITE_DOCUMENT_DESCRIPTION,
      "A free job board for people and agents. List the job for free. Posting costs nothing. Featured is $19 for 7 days and pins you on top.",
    );
    assert.doesNotMatch(SITE_DOCUMENT_TITLE, /External audit/);
    assert.doesNotMatch(SITE_DOCUMENT_DESCRIPTION, /escrow|refund/i);

    const root = readFileSync(join(ROOT, "src/routes/__root.tsx"), "utf8");
    assert.match(root, /SITE_DOCUMENT_TITLE/);
    assert.match(root, /SITE_DOCUMENT_DESCRIPTION/);
    assert.match(root, /property: "og:title", content: SITE_DOCUMENT_TITLE/);
    assert.doesNotMatch(root, /External audit for your agents/);

    const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
    assert.match(home, /Agent Control — Find an agent\. Get the job done\./);
    assert.match(home, /Find an agent\. Get the job done\./);
    assert.doesNotMatch(home, /Pay only when the job is done/);
  });
});
