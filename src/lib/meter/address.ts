import type { MeterChain } from "./scan.ts";

/**
 * Destination syntax validation shared by scan, preflight, and scan-batch.
 * Callers run it before access checks so impossible input never consumes a
 * free or paid look and never receives a risk classification.
 *
 * Solana: Base58-decodes to exactly 32 bytes (an ed25519 pubkey).
 * Ethereum/Base: `0x` + 40 hex characters; mixed-case input must carry the
 * EIP-55 checksum. No new dependency: keccak-f1600 is inlined below.
 */

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map<string, number>(
  [...BASE58_ALPHABET].map((char, i) => [char, i] as const),
);

function base58DecodeToBytes(input: string): Uint8Array | null {
  if (!input.length) return null;
  const bytes: number[] = [];
  for (const char of input) {
    const value = BASE58_INDEX.get(char);
    if (value === undefined) return null;
    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of input) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

// --- Minimal keccak-256 (EIP-55 checksums only, not general hashing). -------

const KECCAK_ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const ROTATION_OFFSETS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function rotl64(value: bigint, shift: number): bigint {
  const s = BigInt(shift);
  return ((value << s) | (value >> (64n - s))) & 0xffffffffffffffffn;
}

/** keccak-f[1600] over a 1088-bit rate with 0x01 padding (keccak-256). */
function keccak256(bytes: Uint8Array): string {
  const state: bigint[][] = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  const readLane = (block: Uint8Array, offset: number) => {
    let lane = 0n;
    for (let i = 7; i >= 0; i -= 1) lane = (lane << 8n) | BigInt(block[offset + i]!);
    return lane;
  };

  for (let blockStart = 0; blockStart < padded.length; blockStart += rate) {
    const block = padded.subarray(blockStart, blockStart + rate);
    for (let laneIndex = 0; laneIndex < rate / 8; laneIndex += 1) {
      const x = laneIndex % 5;
      const y = Math.floor(laneIndex / 5);
      state[x]![y]! ^= readLane(block, 8 * laneIndex);
    }
    for (let round = 0; round < 24; round += 1) {
      const c: bigint[] = [];
      for (let x = 0; x < 5; x += 1) {
        c[x] = state[x]![0]! ^ state[x]![1]! ^ state[x]![2]! ^ state[x]![3]! ^ state[x]![4]!;
      }
      const d: bigint[] = [];
      for (let x = 0; x < 5; x += 1) {
        d[x] = c[(x + 4) % 5]! ^ rotl64(c[(x + 1) % 5]!, 1);
      }
      for (let x = 0; x < 5; x += 1) {
        for (let y = 0; y < 5; y += 1) state[x]![y]! ^= d[x]!;
      }
      const b: bigint[][] = Array.from({ length: 5 }, () => [0n, 0n, 0n, 0n, 0n]);
      for (let x = 0; x < 5; x += 1) {
        for (let y = 0; y < 5; y += 1) {
          b[y]![(2 * x + 3 * y) % 5]! = rotl64(state[x]![y]!, ROTATION_OFFSETS[x]![y]!);
        }
      }
      for (let x = 0; x < 5; x += 1) {
        for (let y = 0; y < 5; y += 1) {
          state[x]![y]! = b[x]![y]! ^ (~b[(x + 1) % 5]![y]! & b[(x + 2) % 5]![y]!);
        }
      }
      state[0]![0]! ^= KECCAK_ROUND_CONSTANTS[round]!;
    }
  }

  let hex = "";
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const lane = state[x]![y]!;
      for (let byte = 0; byte < 8; byte += 1) {
        hex += Number((lane >> BigInt(8 * byte)) & 0xffn)
          .toString(16)
          .padStart(2, "0");
      }
      if (hex.length >= 64) break;
    }
    if (hex.length >= 64) break;
  }
  return hex.slice(0, 64);
}

/** EIP-55 mixed-case checksum. All-lower and all-upper hex are valid forms. */
function matchesEip55Checksum(input: string): boolean {
  const hashHex = keccak256(new TextEncoder().encode(input.toLowerCase()));
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (/\d/.test(char)) continue;
    const shouldBeUpper = parseInt(hashHex[i]!, 16) >= 8;
    if (shouldBeUpper !== (char === char.toUpperCase())) return false;
  }
  return true;
}

export type MeterAddressRejection = "not_base58" | "wrong_length" | "not_hex" | "bad_checksum";

export function validateMeterAddress(
  chain: MeterChain,
  rawAddress: string,
): { ok: true } | { ok: false; code: "invalid_address"; reason: MeterAddressRejection } {
  const address = rawAddress.trim();
  if (chain === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
      return { ok: false, code: "invalid_address", reason: "not_base58" };
    }
    const bytes = base58DecodeToBytes(address);
    if (!bytes || bytes.length !== 32) {
      return { ok: false, code: "invalid_address", reason: "wrong_length" };
    }
    return { ok: true };
  }

  const match = /^0x([0-9a-fA-F]+)$/.exec(address);
  if (!match) return { ok: false, code: "invalid_address", reason: "not_hex" };
  const body = match[1]!;
  if (body.length !== 40) return { ok: false, code: "invalid_address", reason: "wrong_length" };

  const mixedCase = /[A-F]/.test(body) && /[a-f]/.test(body);
  if (mixedCase && !matchesEip55Checksum(body)) {
    return { ok: false, code: "invalid_address", reason: "bad_checksum" };
  }
  return { ok: true };
}

export function invalidAddressResponse(chain: MeterChain, reason: MeterAddressRejection) {
  return { error: "invalid_address", code: "invalid_address", chain, reason } as const;
}
