import { BlockList, isIP } from "node:net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const blocked = new BlockList();

const IPV4_SUBNETS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

for (const [address, prefix] of IPV4_SUBNETS) {
  blocked.addSubnet(address, prefix, "ipv4");
}
blocked.addAddress("255.255.255.255", "ipv4");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addAddress("fd00:ec2::254", "ipv6");

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google",
  "metadata.google.internal",
]);

function ipv4FromMapped(value: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted?.[1]) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (!hex?.[1] || !hex[2]) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isBlockedIp(ip: string): boolean {
  let value = ip.trim().toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const mapped = ipv4FromMapped(value);
  if (mapped) return isBlockedIp(mapped);
  const kind = isIP(value);
  if (kind === 4) return blocked.check(value, "ipv4");
  if (kind === 6) return blocked.check(value, "ipv6");
  return true;
}

function blockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  return false;
}

/** Public https URL only. No userinfo, no non-443 port, no local or metadata host. */
export function parsePublicHttpsUrl(raw: string): URL {
  const text = raw.trim();
  if (!text || text.length > 2000) throw new SsrfError("Use a public https URL.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SsrfError("Use a public https URL.");
  }
  if (url.protocol !== "https:") throw new SsrfError("Use a public https URL.");
  if (url.username || url.password) throw new SsrfError("Use a public https URL.");
  if (url.port && url.port !== "443") throw new SsrfError("Use a public https URL.");
  const host = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  if (blockedHostname(host)) throw new SsrfError("That host is not a public address.");
  if (isIP(host) && isBlockedIp(host)) {
    throw new SsrfError("That host is not a public address.");
  }
  return url;
}

export function assertPublicAddresses(addresses: readonly string[]): void {
  if (addresses.length === 0) throw new SsrfError("That host is not a public address.");
  for (const address of addresses) {
    if (isBlockedIp(address)) throw new SsrfError("That host is not a public address.");
  }
}

export function resolveRedirect(current: URL, location: string): URL {
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    throw new SsrfError("The redirect is not a public https URL.");
  }
  return parsePublicHttpsUrl(next.href);
}
