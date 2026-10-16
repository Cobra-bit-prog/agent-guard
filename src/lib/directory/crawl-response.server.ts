/**
 * Dynamic /sitemap.xml, /agents.json, and /agents.txt.
 * The files in public/ are the static base. Vercel serves public/ from the
 * CDN, so the build strips those four paths and this handler answers them.
 */

import agentsJson from "../../../public/agents.json?raw";
import agentsTxt from "../../../public/agents.txt?raw";
import sitemapXml from "../../../public/sitemap.xml?raw";
import { getSql } from "@/lib/db";
import {
  buildAgentsJson,
  buildAgentsTxt,
  buildSitemapXml,
  toDiscoveryListing,
} from "./crawl.ts";
import { isUndefinedTable, listVisibleListings, type PublicListing } from "./listings.ts";

const CRAWL_PATHS = new Set([
  "/sitemap.xml",
  "/agents.json",
  "/agents.txt",
  "/.well-known/agents.json",
]);

async function visibleListings(): Promise<PublicListing[]> {
  try {
    const sql = await getSql();
    return await listVisibleListings(sql);
  } catch (err) {
    if (isUndefinedTable(err)) return [];
    console.error("[directory] crawl list failed", err instanceof Error ? err.name : "error");
    return [];
  }
}

function headers(contentType: string): Headers {
  return new Headers({
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300",
  });
}

export async function handleDirectoryCrawl(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!CRAWL_PATHS.has(path)) return null;

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  const listings = await visibleListings();
  const discovery = listings.map((listing) => toDiscoveryListing(listing));
  let body: string;
  let contentType: string;
  if (path === "/sitemap.xml") {
    body = buildSitemapXml(sitemapXml, listings);
    contentType = "application/xml; charset=utf-8";
  } else if (path === "/agents.txt") {
    body = buildAgentsTxt(agentsTxt, discovery);
    contentType = "text/plain; charset=utf-8";
  } else {
    body = buildAgentsJson(agentsJson, discovery);
    contentType = "application/json; charset=utf-8";
  }

  return new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: headers(contentType),
  });
}
