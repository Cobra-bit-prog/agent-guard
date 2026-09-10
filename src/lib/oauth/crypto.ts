import { createHash, randomBytes } from "node:crypto";

export const ACCESS_PREFIX = "oat_";
export const REFRESH_PREFIX = "ort_";
export const CODE_PREFIX = "oac_";
export const CLIENT_PREFIX = "oc_";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function s256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function newOpaque(prefix: string): { raw: string; hash: string } {
  const raw = `${prefix}${randomBytes(32).toString("base64url")}`;
  return { raw, hash: sha256Hex(raw) };
}

export function isAccessToken(value: string): boolean {
  return value.startsWith(ACCESS_PREFIX);
}

export function isValidCodeVerifier(verifier: string): boolean {
  return verifier.length >= 43 && verifier.length <= 128 && /^[A-Za-z0-9\-._~]+$/.test(verifier);
}

export function isValidCodeChallenge(challenge: string): boolean {
  return challenge.length >= 43 && challenge.length <= 128 && /^[A-Za-z0-9\-._~]+$/.test(challenge);
}
