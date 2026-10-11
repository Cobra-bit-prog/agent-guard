import type { ListingQuery } from "../directory/listings.ts";
import { lookupDirectory, lookupRegistry, defaultRemoteFetch, type RemoteFetch } from "../x402-check/remote.ts";
import { parsePublicHttpsUrl } from "../x402-check/ssrf.ts";
import { AGENT_CHECK_CAVEAT } from "./copy.ts";
import { freeChecks, fullChecks, type CheckRow, type SiteSnapshot } from "./checks.ts";
import { liveFetch, loadSite, type DocFetch } from "./crawl.ts";

export type AgentReport = {
  product: "agent_readiness_check";
  tier: "free" | "full";
  input: { url: string };
  checks: CheckRow[];
  passed: number;
  failed: number;
  warned: number;
  unchecked: number;
  caveat: string;
  documents: Array<{ path: string; status: number }>;
};

export type RunDeps = {
  fetch?: DocFetch;
  sql?: ListingQuery | null;
  directory?: (host: string) => Promise<{ names: string[] } | null>;
  registry?: (host: string) => Promise<{ listed: boolean } | null>;
  remote?: RemoteFetch;
};

function counts(checks: CheckRow[]) {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    failed: checks.filter((check) => check.status === "fail").length,
    warned: checks.filter((check) => check.status === "warn").length,
    unchecked: checks.filter((check) => check.status === "unchecked").length,
  };
}

function stripFix(checks: CheckRow[]): CheckRow[] {
  return checks.map((check) => {
    const { fix: _fix, ...rest } = check;
    return rest;
  });
}

function documentsOf(site: SiteSnapshot): Array<{ path: string; status: number }> {
  return [site.robots, site.llms, site.agentsWellKnown, site.agentsRoot, site.agentCard, site.mcpJson, site.skill, site.sitemap].map(
    (doc) => ({ path: doc.path, status: doc.status }),
  );
}

function hostOf(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./, "");
}

export async function runAgentCheck(rawUrl: string, tier: "free" | "full", deps: RunDeps = {}): Promise<AgentReport> {
  const origin = parsePublicHttpsUrl(rawUrl).origin;
  const fetch = deps.fetch ?? liveFetch;
  const site = await loadSite(origin, fetch, tier);
  if (tier === "full") {
    const host = hostOf(origin);
    site.directory = deps.directory
      ? await deps.directory(host)
      : deps.sql
        ? await lookupDirectory(deps.sql, host, [])
        : null;
    site.registry = deps.registry ? await deps.registry(host) : await lookupRegistry(host, deps.remote ?? defaultRemoteFetch);
  }
  const checks = tier === "free" ? stripFix(freeChecks(site)) : fullChecks(site);
  return {
    product: "agent_readiness_check",
    tier,
    input: { url: origin },
    checks,
    ...counts(checks),
    caveat: AGENT_CHECK_CAVEAT,
    documents: documentsOf(site),
  };
}
