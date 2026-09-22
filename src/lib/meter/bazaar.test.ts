import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { SOLANA_PAYOUT_ADDRESS } from "../solana-pay.ts";
import { BASE_CAIP2, BASE_USDC, SOLANA_CAIP2, meterPaymentRequiredAccepts } from "./accepts.ts";
import {
  METER_BAZAAR_DESCRIPTION,
  METER_BAZAAR_RESOURCE_URLS,
  METER_BAZAAR_SERVICE_NAME,
  METER_BAZAAR_TAGS,
  assertMeterBazaarDescriptionBound,
  meterBazaarExtension,
  meterBazaarKindFromSource,
  meterBazaarResource,
} from "./bazaar.ts";

describe("CDP Bazaar discovery metadata", () => {
  it("keeps the short description within the 500-character facilitator cap", () => {
    assert.equal(
      METER_BAZAAR_DESCRIPTION,
      "Can I pay this address? ok · new · warn · sink. Buy looks_20 pack ($0.20) or look $0.10. Stamp ticket $0.05. Packs: 20/$0.20 · 100-addr $0.15. Agents pay themselves. No inbox. Base + Solana USDC.",
    );
    assert.ok(METER_BAZAAR_DESCRIPTION.length > 0);
    assert.ok(METER_BAZAAR_DESCRIPTION.length <= 500);
    assert.equal(assertMeterBazaarDescriptionBound(), METER_BAZAAR_DESCRIPTION);
    assert.equal(METER_BAZAAR_SERVICE_NAME.length <= 32, true);
    assert.equal(METER_BAZAAR_TAGS.length <= 5, true);
    assert.match(METER_BAZAAR_DESCRIPTION, /Can I pay this address\?/);
    assert.match(METER_BAZAAR_DESCRIPTION, /Buy looks_20 pack \(\$0\.20\) or look \$0\.10/);
    assert.match(METER_BAZAAR_DESCRIPTION, /Stamp ticket \$0\.05/);
    assert.doesNotMatch(METER_BAZAAR_DESCRIPTION, /First 5 free/);
    assert.doesNotMatch(METER_BAZAAR_DESCRIPTION, /free-5/);
    assert.doesNotMatch(METER_BAZAAR_DESCRIPTION, /Then \$0\.10 USDC per look/);
    assert.match(METER_BAZAAR_DESCRIPTION, /No inbox/);
    assert.match(METER_BAZAAR_DESCRIPTION, /Agents pay themselves/);
  });

  it("declares POST JSON bazaar info that matches its schema", () => {
    const ext = meterBazaarExtension("pass");
    assert.equal(ext.info.input.type, "http");
    assert.equal(ext.info.input.method, "POST");
    assert.equal(ext.info.input.bodyType, "json");
    assert.deepEqual(ext.info.input.body, {});
    assert.equal(ext.schema.required[0], "input");
    assert.equal(ext.schema.properties.input.additionalProperties, false);
    assert.deepEqual(ext.schema.properties.input.required, ["type", "method", "bodyType", "body"]);
    const scan = meterBazaarExtension("scan");
    assert.equal(scan.info.input.body.chain, "solana");
    assert.equal(typeof scan.info.input.body.address, "string");
    assert.equal(meterBazaarResource("pass").url, METER_BAZAAR_RESOURCE_URLS.pass);
    assert.equal(meterBazaarKindFromSource("http_scan"), "scan");
    assert.equal(meterBazaarKindFromSource("http_pass"), "pass");
    assert.equal(meterBazaarKindFromSource("mcp_buy_pass"), "pass");
  });

  it("PAYMENT-REQUIRED accepts keep locked wallets and put Base CAIP-2 first", () => {
    const accepts = meterPaymentRequiredAccepts(
      { sku: "look", amount_usd: 0.1, amount_base_units: "100000" },
      { id: "look", price_usd: 0.1, amount_base_units: "100000" },
      METER_BAZAAR_RESOURCE_URLS.pass,
    );
    assert.equal(accepts.length, 2);
    assert.equal(accepts[0]?.network, BASE_CAIP2);
    assert.equal(accepts[0]?.payTo, EVM_PAYOUT_ADDRESS);
    assert.equal(accepts[0]?.payTo, "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98");
    assert.equal(accepts[0]?.asset, BASE_USDC);
    assert.equal(accepts[0]?.extra.resource, METER_BAZAAR_RESOURCE_URLS.pass);
    assert.equal(accepts[1]?.network, SOLANA_CAIP2);
    assert.equal(accepts[1]?.payTo, SOLANA_PAYOUT_ADDRESS);
    assert.equal(accepts[1]?.payTo, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.notEqual(accepts[0]?.payTo, "HostileWalletDoNotPay11111111111111111111");
    assert.notEqual(accepts[1]?.payTo, "HostileWalletDoNotPay11111111111111111111");
  });
});
