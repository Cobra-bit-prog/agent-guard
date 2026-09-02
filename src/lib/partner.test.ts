import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PARTNER_COOKIE,
  firstTouchPartnerSlug,
  parsePartnerSlug,
  partnerCookieWrite,
  partnerSlugFromCookieHeader,
  partnerSlugFromSearchParams,
} from "./partner.ts";

describe("parsePartnerSlug", () => {
  it("accepts lowercase alphanumeric + hyphen up to 32 chars", () => {
    assert.equal(parsePartnerSlug("turnkey"), "turnkey");
    assert.equal(parsePartnerSlug("testpartner"), "testpartner");
    assert.equal(parsePartnerSlug("Coinbase"), "coinbase");
    assert.equal(parsePartnerSlug(" x402 "), "x402");
    assert.equal(parsePartnerSlug("privy-wallet"), "privy-wallet");
    assert.equal(parsePartnerSlug("a"), "a");
    assert.equal(parsePartnerSlug("a".repeat(32)), "a".repeat(32));
  });

  it("ignores missing, empty, and invalid values", () => {
    assert.equal(parsePartnerSlug(undefined), null);
    assert.equal(parsePartnerSlug(null), null);
    assert.equal(parsePartnerSlug(""), null);
    assert.equal(parsePartnerSlug("   "), null);
    assert.equal(parsePartnerSlug("-turnkey"), null);
    assert.equal(parsePartnerSlug("turn_key"), null);
    assert.equal(parsePartnerSlug("turn.key"), null);
    assert.equal(parsePartnerSlug("a".repeat(33)), null);
    assert.equal(parsePartnerSlug("has space"), null);
    assert.equal(parsePartnerSlug(12), null);
  });
});

describe("partnerSlugFromSearchParams", () => {
  it("reads partner from query strings and objects", () => {
    assert.equal(partnerSlugFromSearchParams("?partner=turnkey"), "turnkey");
    assert.equal(
      partnerSlugFromSearchParams("mode=signup&partner=privy&utm_source=docs"),
      "privy",
    );
    assert.equal(partnerSlugFromSearchParams({ partner: "x402", mode: "signin" }), "x402");
    assert.equal(partnerSlugFromSearchParams(new URLSearchParams("partner=coinbase")), "coinbase");
  });

  it("ignores missing or invalid partner params", () => {
    assert.equal(partnerSlugFromSearchParams(""), null);
    assert.equal(partnerSlugFromSearchParams("?utm_source=docs"), null);
    assert.equal(partnerSlugFromSearchParams({ mode: "signup" }), null);
    assert.equal(partnerSlugFromSearchParams({ partner: "nope!" }), null);
    assert.equal(partnerSlugFromSearchParams(undefined), null);
  });
});

describe("partner cookie helpers", () => {
  it("writes and parses the first-touch cookie", () => {
    const header = partnerCookieWrite("Turnkey");
    assert.match(header, new RegExp(`^${PARTNER_COOKIE}=turnkey;`));
    assert.match(header, /Path=\//);
    assert.match(header, /SameSite=Lax/);
    assert.equal(
      partnerSlugFromCookieHeader(`session=abc; ${PARTNER_COOKIE}=turnkey; other=1`),
      "turnkey",
    );
  });

  it("ignores a bad cookie value", () => {
    assert.equal(partnerSlugFromCookieHeader(`${PARTNER_COOKIE}=nope!`), null);
    assert.equal(partnerSlugFromCookieHeader(""), null);
  });
});

describe("firstTouchPartnerSlug", () => {
  it("stores the first valid slug and never overwrites", () => {
    assert.equal(firstTouchPartnerSlug(undefined, "turnkey"), "turnkey");
    assert.equal(firstTouchPartnerSlug("", "privy"), "privy");
    assert.equal(firstTouchPartnerSlug("turnkey", "privy"), null);
    assert.equal(firstTouchPartnerSlug("turnkey", "nope!"), null);
    assert.equal(firstTouchPartnerSlug(null, "bad slug"), null);
  });
});
