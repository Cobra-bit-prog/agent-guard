import {
  clientIp,
  createListing as createJob,
  hashPosterIp,
  isUndefinedTable as jobsTableMissing,
  listOpenJobs,
  ListingError as JobListingError,
  type ListingQuery,
} from "../exchange/listings.ts";
import {
  createListing as createAgentListing,
  hashClientIp,
  isUndefinedTable as agentsTableMissing,
  listVisibleListings,
  ListingError as AgentListingError,
} from "../directory/listings.ts";
import type { McpToolCallResult } from "../mcp/handle.ts";
import { MCP_MARKETPLACE_TOOLS } from "../mcp/tools.ts";

const MARKETPLACE_NAMES = new Set<string>(MCP_MARKETPLACE_TOOLS);

export function isMarketplaceMcpTool(name: string): boolean {
  return MARKETPLACE_NAMES.has(name);
}

export type MarketplaceToolDeps = {
  sql: ListingQuery;
  now?: Date;
  headers?: { get(name: string): string | null };
};

function fail(
  err: unknown,
  missing: (error: unknown) => boolean,
  missingMessage: string,
  fallback: string,
): McpToolCallResult {
  if (err instanceof JobListingError || err instanceof AgentListingError) {
    return { ok: false, status: err.status, code: err.status, message: err.message };
  }
  if (missing(err)) {
    return { ok: false, status: 503, code: 503, message: missingMessage };
  }
  console.error("[marketplace-mcp]", err instanceof Error ? err.name : "error");
  return { ok: false, status: 500, code: 500, message: fallback };
}

/**
 * Free job board and agent directory. No API key, no Meter look, no Action Gate seat.
 * Calls the same listing functions as the public HTTP routes.
 */
export async function runMarketplaceTool(
  name: string,
  args: Record<string, unknown>,
  deps: MarketplaceToolDeps,
): Promise<McpToolCallResult | null> {
  if (!isMarketplaceMcpTool(name)) return null;
  const now = deps.now ?? new Date();
  const ip = deps.headers ? clientIp(deps.headers) : "unknown";

  if (name === "list_open_jobs") {
    try {
      const jobs = await listOpenJobs(deps.sql);
      return { ok: true, result: { jobs } };
    } catch (err) {
      return fail(
        err,
        jobsTableMissing,
        "Job board is not on this database yet.",
        "Could not load jobs",
      );
    }
  }

  if (name === "post_job") {
    try {
      const job = await createJob(deps.sql, args, now, hashPosterIp(ip));
      return { ok: true, result: { job } };
    } catch (err) {
      return fail(
        err,
        jobsTableMissing,
        "Job board is not on this database yet.",
        "Could not post this job.",
      );
    }
  }

  if (name === "browse_agents") {
    try {
      const listings = await listVisibleListings(deps.sql);
      return { ok: true, result: { listings } };
    } catch (err) {
      return fail(
        err,
        agentsTableMissing,
        "Agent directory is not on this database yet.",
        "Could not load agents",
      );
    }
  }

  if (name === "list_your_agent") {
    try {
      const listing = await createAgentListing(deps.sql, args, now, hashClientIp(ip));
      return { ok: true, result: { listing } };
    } catch (err) {
      return fail(
        err,
        agentsTableMissing,
        "Agent directory is not on this database yet.",
        "Could not list this agent.",
      );
    }
  }

  return null;
}
