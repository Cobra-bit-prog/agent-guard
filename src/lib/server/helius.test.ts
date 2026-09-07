import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { heliusConfigured, heliusWebhookUrl } from "./helius.server.ts";

describe("Helius env helpers", () => {
  it("builds POST /api/v1/billing/helius from origin when HELIUS_WEBHOOK_URL is unset", () => {
    const prev = process.env.HELIUS_WEBHOOK_URL;
    delete process.env.HELIUS_WEBHOOK_URL;
    try {
      assert.equal(
        heliusWebhookUrl("https://agent-control.net"),
        "https://agent-control.net/api/v1/billing/helius",
      );
      assert.equal(typeof heliusConfigured(), "boolean");
    } finally {
      if (prev === undefined) delete process.env.HELIUS_WEBHOOK_URL;
      else process.env.HELIUS_WEBHOOK_URL = prev;
    }
  });
});
