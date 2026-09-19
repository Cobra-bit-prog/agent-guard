import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { BASE_USDC } from "./accepts.ts";
import {
  METER_402_TOOL_FIELDS,
  METER_ADAPTER_SNIPPET,
  METER_EXACT_PRIMARY_TYPE,
  meter402SignExact,
  meterExactEip712Domain,
} from "./sign-exact.ts";

describe("Meter in-process Base signExact fields", () => {
  it("locks payTo and exposes CDP/AgentKit typed data plus watch args", () => {
    const sign = meter402SignExact({
      invoice_id: "inv_oneshot",
      reference: "ref_oneshot",
      amount_base_units: "200000",
    });
    assert.equal(sign.pay_to, EVM_PAYOUT_ADDRESS);
    assert.equal(sign.pay_to, "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98");
    assert.equal(sign.asset, BASE_USDC);
    assert.equal(sign.chain_id, 8453);
    assert.equal(sign.caip2, "eip155:8453");
    assert.equal(sign.network, "base");
    assert.equal(sign.primaryType, METER_EXACT_PRIMARY_TYPE);
    assert.equal(sign.authorization.to, EVM_PAYOUT_ADDRESS);
    assert.equal(sign.authorization.value, "200000");
    assert.equal(sign.authorization.from, "");
    assert.equal(sign.domain.verifyingContract, BASE_USDC);
    assert.equal(sign.domain.chainId, 8453);
    assert.equal(sign.payment_template.accepted.extra.invoice_id, "inv_oneshot");
    assert.equal(sign.watch.tool, "meter_watch");
    assert.equal(sign.watch.invoice_id, "inv_oneshot");
    assert.equal(sign.next_tool, "meter_watch");
    assert.match(sign.sign, /We never take keys/);
    assert.match(METER_ADAPTER_SNIPPET, /payMeterPassBase/);
    assert.match(METER_ADAPTER_SNIPPET, /meter_watch/);
    assert.ok(METER_402_TOOL_FIELDS.includes("sign_exact"));
    assert.ok(METER_402_TOOL_FIELDS.includes("adapter_snippet"));
    assert.deepEqual(meterExactEip712Domain(), sign.domain);
  });
});
