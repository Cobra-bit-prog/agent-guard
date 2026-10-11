import { AGENT_CHECK_LINK_LIMIT, AGENT_CHECK_MAX_BYTES } from "./copy.ts";
import {
  extractLinks,
  firstMcpUrl,
  readJson,
  type FetchedDoc,
  type LinkProbe,
  type McpProbe,
  type SiteSnapshot,
} from "./checks.ts";
import { fetchPublicHttps, type LookupFn, type ProbeTransport } from "../x402-check/probe.ts";
import { SsrfError } from "../x402-check/ssrf.ts";

export const AGENT_CHECK_USER_AGENT = "AgentControl-agent-check/1.0";

export type DocFetch = (
  url: string,
  init?: { method?: "GET" | "HEAD" | "POST"; body?: string; headers?: Record<string, string> },
) => Promise<{
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
  headers: Record<string, string>;
  error: string | null;
}>;

const EMPTY = (path: string): FetchedDoc => ({
  path,
  status: 0,
  contentType: "",
  body: "",
  truncated: false,
  error: "The file did not answer.",
});

export async function liveFetch(
  url: string,
  init?: { method?: "GET" | "HEAD" | "POST"; body?: string; headers?: Record<string, string> },
  deps: { lookup?: LookupFn; transport?: ProbeTransport } = {},
): Promise<{
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
  headers: Record<string, string>;
  error: string | null;
}> {
  try {
    const result = await fetchPublicHttps(url, {
      method: init?.method ?? "GET",
      body: init?.body,
      headers: {
        accept: init?.headers?.accept ?? "text/plain, text/markdown, application/json, application/xml, */*",
        "user-agent": AGENT_CHECK_USER_AGENT,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      maxBytes: AGENT_CHECK_MAX_BYTES,
      lookup: deps.lookup,
      transport: deps.transport,
    });
    const headers: Record<string, string> = {};
    for (const name of ["content-type", "mcp-session-id", "location"]) {
      const value = result.headers.get(name);
      if (value) headers[name] = value;
    }
    return {
      status: result.status,
      contentType: result.contentType,
      body: result.bodyText,
      truncated: result.truncated,
      headers,
      error: null,
    };
  } catch (err) {
    const message = err instanceof SsrfError ? err.message : "The file did not answer.";
    return { status: 0, contentType: "", body: "", truncated: false, headers: {}, error: message };
  }
}

function asDoc(path: string, result: Awaited<ReturnType<DocFetch>>): FetchedDoc {
  return {
    path,
    status: result.status,
    contentType: result.contentType,
    body: result.body,
    truncated: result.truncated,
    error: result.error,
  };
}

function usefulSkill(doc: FetchedDoc): boolean {
  if (doc.status !== 200 || doc.error) return false;
  const start = doc.body.trim().slice(0, 20).toLowerCase();
  if (start.startsWith("<!doctype") || start.startsWith("<html")) return false;
  if (doc.contentType.toLowerCase().includes("text/html")) return false;
  return doc.body.trim().length >= 40;
}

function readRpc(body: string, contentType: string): Record<string, unknown> | null {
  let text = body;
  if (contentType.includes("event-stream") || body.includes("\ndata:") || body.startsWith("data:")) {
    const lines = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    text = lines[lines.length - 1] ?? "";
  }
  return readJson(text);
}

async function probeMcp(url: string, fetch: DocFetch): Promise<McpProbe> {
  const initBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "Agent Control readiness", version: "1.0.0" },
    },
  });
  const init = await fetch(url, {
    method: "POST",
    body: initBody,
    headers: { accept: "application/json" },
  });
  if (init.error && init.status === 0) {
    return { url, initializeStatus: 0, listed: null, error: init.error };
  }
  const rpc = readRpc(init.body, init.contentType);
  const result = rpc && typeof rpc.result === "object" && rpc.result ? rpc.result : null;
  if (init.status !== 200 || !result) {
    return { url, initializeStatus: init.status, listed: null, error: init.error };
  }
  const list = await fetch(url, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    headers: {
      accept: "application/json",
      ...(init.headers["mcp-session-id"] ? { "mcp-session-id": init.headers["mcp-session-id"] } : {}),
    },
  });
  const listedRpc = readRpc(list.body, list.contentType);
  const tools = listedRpc && typeof listedRpc.result === "object" && listedRpc.result
    ? (listedRpc.result as { tools?: unknown }).tools
    : null;
  return {
    url,
    initializeStatus: init.status,
    listed: Array.isArray(tools) ? true : false,
    error: list.error,
  };
}

async function probeLink(url: string, fetch: DocFetch): Promise<LinkProbe> {
  const head = await fetch(url, { method: "HEAD" });
  if (!head.error && head.status !== 405 && head.status !== 501 && head.status !== 0) {
    return { url, status: head.status, error: null };
  }
  const get = await fetch(url, { method: "GET" });
  return { url, status: get.status, error: get.error };
}

export async function loadSite(origin: string, fetch: DocFetch, tier: "free" | "full"): Promise<SiteSnapshot> {
  const paths = [
    "/robots.txt",
    "/llms.txt",
    "/.well-known/agents.json",
    "/agents.json",
    "/.well-known/agent-card.json",
    "/.well-known/mcp.json",
    "/sitemap.xml",
  ] as const;
  const loaded = await Promise.all(paths.map(async (path) => asDoc(path, await fetch(`${origin}${path}`))));
  const byPath = new Map(loaded.map((doc) => [doc.path, doc]));
  let skill = asDoc("/skill.md", await fetch(`${origin}/skill.md`));
  if (!usefulSkill(skill)) {
    for (const path of ["/SKILL.md", "/agents.md", "/AGENTS.md"]) {
      const next = asDoc(path, await fetch(`${origin}${path}`));
      skill = next;
      if (usefulSkill(next)) break;
    }
  }
  const site: SiteSnapshot = {
    origin,
    robots: byPath.get("/robots.txt") ?? EMPTY("/robots.txt"),
    llms: byPath.get("/llms.txt") ?? EMPTY("/llms.txt"),
    agentsWellKnown: byPath.get("/.well-known/agents.json") ?? EMPTY("/.well-known/agents.json"),
    agentsRoot: byPath.get("/agents.json") ?? EMPTY("/agents.json"),
    agentCard: byPath.get("/.well-known/agent-card.json") ?? EMPTY("/.well-known/agent-card.json"),
    mcpJson: byPath.get("/.well-known/mcp.json") ?? EMPTY("/.well-known/mcp.json"),
    skill,
    sitemap: byPath.get("/sitemap.xml") ?? EMPTY("/sitemap.xml"),
    links: [],
    mcp: null,
    directory: null,
    registry: null,
  };
  if (!usefulSkill(site.skill)) {
    const json = site.agentsWellKnown.status === 200 ? readJson(site.agentsWellKnown.body) : readJson(site.agentsRoot.body);
    const skills = json && Array.isArray(json.skills) ? json.skills : [];
    const first = skills.find((item) => item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") as
      | { url: string }
      | undefined;
    if (first?.url) {
      try {
        const url = new URL(first.url, origin);
        if (url.protocol === "https:") {
          const extra = asDoc(url.pathname || "/skill.md", await fetch(url.href));
          if (usefulSkill(extra)) site.skill = extra;
        }
      } catch {
        /* the skill url was not usable */
      }
    }
  }
  if (tier === "full") {
    if (site.llms.status === 200) {
      const links = extractLinks(origin, site.llms.body, AGENT_CHECK_LINK_LIMIT);
      site.links = await Promise.all(links.map((url) => probeLink(url, fetch)));
    }
    const mcpUrl = firstMcpUrl(site);
    if (mcpUrl) site.mcp = await probeMcp(mcpUrl, fetch);
  }
  return site;
}
