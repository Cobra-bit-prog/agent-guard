import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateMeterAddress } from "./address.ts";

describe("validateMeterAddress", () => {
  describe("solana", () => {
    it("accepts valid 32-byte Base58 addresses", () => {
      // 32 zero bytes in base58: 32 ones
      assert.deepEqual(validateMeterAddress("solana", "11111111111111111111111111111111"), {
        ok: true,
      });
      // standard mint/account
      assert.deepEqual(
        validateMeterAddress("solana", "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR"),
        { ok: true },
      );
      assert.deepEqual(
        validateMeterAddress("solana", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
        { ok: true },
      );
    });

    it("rejects non-base58 strings", () => {
      const res = validateMeterAddress("solana", "not-an-address");
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, "invalid_address");
        assert.equal(res.reason, "not_base58");
      }
    });

    it("rejects base58 strings that do not decode to 32 bytes", () => {
      // 31 ones (31 bytes)
      const resShort = validateMeterAddress("solana", "1111111111111111111111111111111");
      assert.equal(resShort.ok, false);
      if (!resShort.ok) {
        assert.equal(resShort.code, "invalid_address");
        assert.equal(resShort.reason, "wrong_length");
      }

      // 33 ones
      const resLong = validateMeterAddress("solana", "111111111111111111111111111111111");
      assert.equal(resLong.ok, false);
      if (!resLong.ok) {
        assert.equal(resLong.code, "invalid_address");
        assert.equal(resLong.reason, "wrong_length");
      }
    });
  });

  describe("ethereum and base", () => {
    const validLower = "0x000000000000000000000000000000000000dead";
    const validCheck = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // canonical EIP-55 test vector

    it("accepts valid lower-case hex addresses", () => {
      assert.deepEqual(validateMeterAddress("ethereum", validLower), { ok: true });
      assert.deepEqual(validateMeterAddress("base", validLower), { ok: true });
    });

    it("accepts valid EIP-55 checksummed addresses", () => {
      assert.deepEqual(validateMeterAddress("ethereum", validCheck), { ok: true });
      assert.deepEqual(validateMeterAddress("base", validCheck), { ok: true });
    });

    it("rejects strings without 0x prefix or with invalid hex characters", () => {
      const no0x = validateMeterAddress("ethereum", "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
      assert.equal(no0x.ok, false);
      if (!no0x.ok) assert.equal(no0x.code, "invalid_address");

      const notHex = validateMeterAddress("base", "0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
      assert.equal(notHex.ok, false);
      if (!notHex.ok) assert.equal(notHex.code, "invalid_address");
    });

    it("rejects wrong length EVM hex addresses", () => {
      const short = validateMeterAddress("ethereum", "0xdeadbeef");
      assert.equal(short.ok, false);
      if (!short.ok) {
        assert.equal(short.code, "invalid_address");
        assert.equal(short.reason, "wrong_length");
      }
    });

    it("rejects invalid EIP-55 checksum when mixed-case is used", () => {
      // Invert one letter's case in validCheck
      const badCheck = "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
      const res = validateMeterAddress("ethereum", badCheck);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, "invalid_address");
        assert.equal(res.reason, "bad_checksum");
      }
    });
  });
});
