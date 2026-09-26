import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CORS } from "./http.ts";

const ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-Api-Key",
  "X-Helius-Secret",
  "X-Agent-Pass",
  "X-Stamp-Id",
  "X-Seller",
] as const;

describe("shared API CORS", () => {
  it("allows X-Seller on stamp verify and gate preflight", () => {
    const allow = CORS["Access-Control-Allow-Headers"];
    assert.equal(allow, ALLOW_HEADERS.join(", "));
    assert.match(allow, /(?:^|, )X-Seller(?:,|$)/);
  });
});
