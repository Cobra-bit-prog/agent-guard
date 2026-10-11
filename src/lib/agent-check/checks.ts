import { AGENT_DESCRIPTION_MAX } from "./copy.ts";
import { blockedAgentPaths, crawlerReport, parseRobots } from "./robots.ts";

export type CheckStatus = "pass" | "fail" | "warn" | "unchecked";

export type CheckRow = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
};

export type FetchedDoc = {
  path: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
  error: string | null;
};

export type LinkProbe = {
  url: string;
  status: number;
  error: string | null;
};

export type McpProbe = {
  url: string;
  initializeStatus: number;
  listed: boolean | null;
  error: string | null;
};

export type SiteSnapshot = {
  origin: string;
  robots: FetchedDoc;
  llms: FetchedDoc;
  agentsWellKnown: FetchedDoc;
  agentsRoot: FetchedDoc;
  agentCard: FetchedDoc;
  mcpJson: FetchedDoc;
  skill: FetchedDoc;
  sitemap: FetchedDoc;
  links: LinkProbe[];
  mcp: McpProbe | null;
  directory: { names: string[] } | null;
  registry: { listed: boolean } | null;
};

function row(id: string, title: string, status: CheckStatus, detail: string, fix?: string): CheckRow {
  return fix ? { id, title, status, detail, fix } : { id, title, status, detail };
}

function bag(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readJson(body: string): Record<string, unknown> | null {
  try {
    return bag(JSON.parse(body));
  } catch {
    return null;
  }
}

function htmlBody(doc: FetchedDoc): boolean {
  const type = doc.contentType.toLowerCase();
  if (type.includes("text/html")) return true;
  const start = doc.body.trim().slice(0, 40).toLowerCase();
  return start.startsWith("<!doctype") || start.startsWith("<html");
}

function textType(contentType: string): boolean {
  const type = contentType.toLowerCase();
  if (!type) return true;
  if (type.includes("text/html") || type.includes("application/json")) return false;
  return type.includes("text/") || type.includes("octet-stream") || type.includes("markdown");
}

export function descriptionProblem(text: string): string | null {
  const value = text.trim();
  if (!value) return "The description is empty.";
  if (/[\r\n]/.test(value)) return "The description is more than one line.";
  if (value.length > AGENT_DESCRIPTION_MAX) {
    return `The description is ${value.length} characters. One clear sentence is ${AGENT_DESCRIPTION_MAX} characters or less.`;
  }
  const sentences = value.split(/[.!?]+\s+/).filter((part) => part.trim());
  if (sentences.length > 1) return "The description is more than one sentence.";
  return null;
}

export function shortenDescription(text: string): string {
  const one = text.trim().split(/[.!?]+\s+/)[0]?.trim() || text.trim();
  const cut = one.length > 160 ? `${one.slice(0, 157).trim()}...` : one;
  return /[.!?]$/.test(cut) ? cut : `${cut}.`;
}

function docFailed(doc: FetchedDoc): string | null {
  if (doc.error) return doc.error;
  if (doc.status === 0) return "The file did not answer.";
  return null;
}

function agentsDocs(site: SiteSnapshot): FetchedDoc[] {
  return [site.agentsWellKnown, site.agentsRoot];
}

function parsedAgents(site: SiteSnapshot): Array<{ path: string; json: Record<string, unknown> }> {
  const found: Array<{ path: string; json: Record<string, unknown> }> = [];
  for (const doc of agentsDocs(site)) {
    if (doc.status !== 200 || doc.error) continue;
    const json = readJson(doc.body);
    if (json) found.push({ path: doc.path, json });
  }
  return found;
}

export function agentPathsFrom(origin: string, texts: readonly string[]): string[] {
  const host = new URL(origin).host;
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
      try {
        const url = new URL(match[0].replace(/[.,);]+$/, ""));
        if (url.host === host && url.pathname && url.pathname !== "/") found.add(url.pathname);
      } catch {
        /* skip a bad url */
      }
    }
    for (const match of text.matchAll(/(?:GET|POST|HEAD)\s+(\/[A-Za-z0-9._~%+\-/]*)/g)) {
      const path = match[1]?.replace(/[.,);]+$/, "");
      if (path && path !== "/") found.add(path);
    }
  }
  return [...found].slice(0, 40);
}

export function extractLinks(origin: string, text: string, limit: number): string[] {
  const base = new URL(origin);
  const same: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      return;
    }
    if (url.protocol !== "https:") return;
    url.hash = "";
    const href = url.href;
    if (seen.has(href) || url.pathname === "/llms.txt") return;
    seen.add(href);
    if (url.host === base.host) same.push(href);
    else other.push(href);
  };
  for (const match of text.matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
    push(match[0].replace(/[.,);]+$/, ""));
  }
  for (const match of text.matchAll(/(?:GET|POST|HEAD)\s+(\/[^\s)]+)/g)) {
    push(match[1]?.replace(/[.,);]+$/, "") ?? "");
  }
  return [...same, ...other].slice(0, limit);
}

function advertisedText(site: SiteSnapshot): string {
  return [site.llms, site.skill, site.agentsWellKnown, site.agentsRoot, site.agentCard, site.mcpJson]
    .map((doc) => doc.body)
    .join("\n");
}

export function agentsSkeleton(origin: string): string {
  return JSON.stringify(
    {
      site: {
        name: "Your site",
        url: origin,
        description: "One sentence about what an agent can do here.",
      },
      skills: [{ url: `${origin}/skill.md`, description: "How an agent starts on this site." }],
      payments: { note: "Say how an agent pays. Omit this block if the site is free." },
      mcp: [
        {
          url: `${origin}/mcp`,
          type: "streamable-http",
          version: "2025-06-18",
          description: "What this MCP server does.",
        },
      ],
    },
    null,
    2,
  );
}

function siteFields(json: Record<string, unknown>): string[] {
  const site = bag(json.site);
  const missing: string[] = [];
  if (!site || typeof site.name !== "string" || !site.name.trim()) missing.push("site.name");
  if (!site || typeof site.url !== "string" || !site.url.trim()) missing.push("site.url");
  if (!site || typeof site.description !== "string" || !site.description.trim()) missing.push("site.description");
  return missing;
}

export function checkRobotsPaths(site: SiteSnapshot): CheckRow {
  const title = "robots.txt and the paths you advertise";
  const failed = docFailed(site.robots);
  if (failed && site.robots.status !== 404) return row("robots_paths", title, "unchecked", `Could not read robots.txt. ${failed}`);
  const texts = [site.llms.body, site.skill.body, site.agentsWellKnown.body, site.agentsRoot.body, site.agentCard.body, site.mcpJson.body];
  const paths = agentPathsFrom(site.origin, texts);
  if (site.robots.status === 404 || !site.robots.body.trim()) {
    return row(
      "robots_paths",
      title,
      "pass",
      paths.length
        ? "No robots.txt, so this file does not block the paths in your agent files. Crawlers use their own default."
        : "No robots.txt, and the agent files did not name a path to compare.",
    );
  }
  const blocked = blockedAgentPaths(site.robots.body, paths);
  if (!paths.length) {
    return row("robots_paths", title, "warn", "robots.txt is there. The agent files did not name a path to compare.");
  }
  if (!blocked.length) {
    return row(
      "robots_paths",
      title,
      "pass",
      `robots.txt allows the ${paths.length} path${paths.length === 1 ? "" : "s"} named in the agent files. The longest matching Allow or Disallow wins.`,
    );
  }
  const shown = blocked.slice(0, 8);
  const allow = shown.map((path) => `Allow: ${path}`).join("\n");
  return row(
    "robots_paths",
    title,
    "fail",
    `robots.txt blocks ${blocked.length} path${blocked.length === 1 ? "" : "s"} that your agent files name: ${shown.join(", ")}. A broad Disallow still blocks a path unless a longer Allow covers it.`,
    `${allow}\n# Put each Allow in the same group as the Disallow. If a path should stay private, remove it from llms.txt, agents.json, skill.md, and the agent card.`,
  );
}

export function checkLlms(site: SiteSnapshot): CheckRow {
  const title = "llms.txt";
  const failed = docFailed(site.llms);
  if (failed) return row("llms_txt", title, "unchecked", `Could not read /llms.txt. ${failed}`);
  if (site.llms.status === 404) {
    return row("llms_txt", title, "fail", "There is no /llms.txt.", "# Your site\n\nOne short paragraph. Then the https URLs an agent should call.\n");
  }
  if (site.llms.status !== 200) return row("llms_txt", title, "fail", `/llms.txt answered HTTP ${site.llms.status}.`);
  if (htmlBody(site.llms)) return row("llms_txt", title, "fail", "/llms.txt came back as HTML. Agents expect plain text.");
  if (!textType(site.llms.contentType)) {
    return row("llms_txt", title, "fail", `/llms.txt content type is ${site.llms.contentType || "missing"}. Use text/plain.`);
  }
  if (site.llms.truncated || site.llms.body.length > 64 * 1024) {
    return row("llms_txt", title, "fail", "/llms.txt is larger than 64KB. Cut it down to the pages and APIs an agent should use.");
  }
  if (!site.llms.body.trim()) return row("llms_txt", title, "fail", "/llms.txt is empty.");
  return row("llms_txt", title, "pass", `/llms.txt is plain text, ${site.llms.body.length} characters.`);
}

export function checkLlmsLinks(site: SiteSnapshot): CheckRow {
  const title = "Links in llms.txt";
  if (site.llms.status !== 200 || site.llms.error) {
    return row("llms_links", title, "unchecked", "Could not check links because /llms.txt did not load.");
  }
  if (!site.links.length) {
    return row("llms_links", title, "warn", "llms.txt has no https link to try.");
  }
  const bad = site.links.filter((link) => link.error || link.status === 404 || link.status === 410);
  const missed = site.links.filter((link) => !link.error && link.status !== 0 && (link.status < 200 || link.status >= 400) && link.status !== 404 && link.status !== 410);
  if (site.links.every((link) => link.error || link.status === 0)) {
    return row("llms_links", title, "unchecked", "Could not check the links in llms.txt.");
  }
  if (bad.length) {
    const sample = bad.slice(0, 3).map((link) => `${link.url} (${link.error ?? `HTTP ${link.status}`})`).join("; ");
    return row("llms_links", title, "fail", `${bad.length} link${bad.length === 1 ? "" : "s"} in llms.txt did not resolve. ${sample}`);
  }
  if (missed.length) {
    return row(
      "llms_links",
      title,
      "warn",
      `${missed.length} link${missed.length === 1 ? "" : "s"} answered with an error status. The rest resolved. Checked ${site.links.length}.`,
    );
  }
  return row("llms_links", title, "pass", `${site.links.length} link${site.links.length === 1 ? "" : "s"} in llms.txt resolved. Checked up to 5.`);
}

export function checkAgentsJson(site: SiteSnapshot): CheckRow {
  const title = "agents.json";
  const docs = agentsDocs(site);
  if (docs.every((doc) => doc.error)) {
    return row("agents_json", title, "unchecked", "Could not read /.well-known/agents.json or /agents.json.");
  }
  const present = docs.filter((doc) => doc.status === 200);
  if (!present.length) {
    return row(
      "agents_json",
      title,
      "fail",
      "No /.well-known/agents.json and no /agents.json.",
      agentsSkeleton(site.origin),
    );
  }
  const parsed = parsedAgents(site);
  if (!parsed.length) {
    return row("agents_json", title, "fail", "agents.json is not JSON.", agentsSkeleton(site.origin));
  }
  const missing = siteFields(parsed[0].json);
  if (missing.length) {
    return row(
      "agents_json",
      title,
      "fail",
      `${parsed[0].path} is missing ${missing.join(", ")}.`,
      agentsSkeleton(site.origin),
    );
  }
  if (parsed.length === 2 && JSON.stringify(parsed[0].json) !== JSON.stringify(parsed[1].json)) {
    return row(
      "agents_json",
      title,
      "warn",
      "Both /.well-known/agents.json and /agents.json exist, and they do not match. An agent may read either one.",
    );
  }
  return row("agents_json", title, "pass", `${parsed[0].path} is JSON and has site.name, site.url, and site.description.`);
}

function descriptionFields(json: Record<string, unknown>, prefix: string): Array<{ where: string; text: string }> {
  const found: Array<{ where: string; text: string }> = [];
  const walk = (value: unknown, where: string) => {
    const object = bag(value);
    if (!object) return;
    if (typeof object.description === "string") found.push({ where, text: object.description });
    for (const [key, child] of Object.entries(object)) {
      if (key === "description") continue;
      if (Array.isArray(child)) {
        child.forEach((item, index) => walk(item, `${where}.${key}[${index}]`));
      } else if (bag(child)) walk(child, `${where}.${key}`);
    }
  };
  walk(json, prefix);
  return found;
}

export function checkDescriptions(site: SiteSnapshot): CheckRow {
  const title = "Description length";
  const sources = [
    ...parsedAgents(site).map((item) => ({ path: item.path, json: item.json })),
    ...(readJson(site.agentCard.body) && site.agentCard.status === 200
      ? [{ path: site.agentCard.path, json: readJson(site.agentCard.body) as Record<string, unknown> }]
      : []),
    ...(readJson(site.mcpJson.body) && site.mcpJson.status === 200
      ? [{ path: site.mcpJson.path, json: readJson(site.mcpJson.body) as Record<string, unknown> }]
      : []),
  ];
  if (!sources.length) {
    return row("descriptions", title, "fail", "No agent JSON to read a description from.");
  }
  const problems: string[] = [];
  const fixes: string[] = [];
  for (const source of sources) {
    for (const field of descriptionFields(source.json, source.path)) {
      const problem = descriptionProblem(field.text);
      if (!problem) continue;
      problems.push(`${field.where}: ${problem}`);
      fixes.push(`${field.where}\n${shortenDescription(field.text)}`);
    }
  }
  if (!problems.length) return row("descriptions", title, "pass", "Each description is one clear sentence.");
  return row(
    "descriptions",
    title,
    "fail",
    problems.slice(0, 4).join(" "),
    fixes.slice(0, 4).join("\n\n"),
  );
}

function mentionsPayment(text: string): boolean {
  return /usdc|x402|\$\s?\d/i.test(text);
}

function mentionsSkill(site: SiteSnapshot): boolean {
  if (site.skill.status === 200 && site.skill.body.trim().length >= 40) return true;
  return /skill\.md|\/skills\b/i.test(site.llms.body);
}

function mcpAdvertised(json: Record<string, unknown> | null): boolean {
  if (!json) return false;
  if (typeof json.mcp === "string" && json.mcp) return true;
  if (typeof json.url === "string" && /mcp/i.test(json.url)) return true;
  if (Array.isArray(json.mcp) && json.mcp.length > 0) return true;
  if (Array.isArray(json.remotes) && json.remotes.length > 0) return true;
  return false;
}

export function checkBlocks(site: SiteSnapshot): CheckRow {
  const title = "Skills and payments blocks";
  const parsed = parsedAgents(site);
  if (!parsed.length) return row("agent_blocks", title, "fail", "No agents.json, so there is no skills or payments block.", agentsSkeleton(site.origin));
  const json = parsed[0].json;
  const problems: string[] = [];
  const skills = json.skills;
  if (mentionsSkill(site) && (!Array.isArray(skills) || skills.length === 0)) {
    problems.push("The files point at a skill, and agents.json has no skills block.");
  }
  if (mentionsPayment(advertisedText(site)) && !bag(json.payments)) {
    problems.push("The files mention a price or USDC, and agents.json has no payments block.");
  }
  if (!problems.length) {
    const notes: string[] = [];
    if (!mentionsSkill(site)) notes.push("No skill file was required.");
    if (!mentionsPayment(advertisedText(site))) notes.push("No price was advertised, so a payments block is optional.");
    if (Array.isArray(skills) && skills.length) notes.push("skills is present.");
    if (bag(json.payments)) notes.push("payments is present.");
    return row("agent_blocks", title, "pass", notes.join(" ") || "The blocks that apply are present.");
  }
  return row("agent_blocks", title, "fail", problems.join(" "), agentsSkeleton(site.origin));
}

type VersionSpot = { where: string; version: string | null };

function versionSpots(site: SiteSnapshot): VersionSpot[] {
  const spots: VersionSpot[] = [];
  for (const item of parsedAgents(site)) {
    if (!Array.isArray(item.json.mcp)) continue;
    item.json.mcp.forEach((entry, index) => {
      const object = bag(entry);
      if (!object) return;
      const version = typeof object.version === "string" ? object.version : null;
      spots.push({ where: `${item.path} mcp[${index}]`, version });
    });
  }
  const manifest = site.mcpJson.status === 200 ? readJson(site.mcpJson.body) : null;
  if (manifest && mcpAdvertised(manifest)) {
    const remote = Array.isArray(manifest.remotes) ? manifest.remotes : [];
    if (remote.length) {
      remote.forEach((entry, index) => {
        const object = bag(entry);
        const version = object && typeof object.version === "string" ? object.version : null;
        spots.push({ where: `${site.mcpJson.path} remotes[${index}]`, version });
      });
    } else {
      const version = typeof manifest.version === "string" ? manifest.version : null;
      spots.push({ where: site.mcpJson.path, version });
    }
  }
  const card = site.agentCard.status === 200 ? readJson(site.agentCard.body) : null;
  if (card && Array.isArray(card.supportedInterfaces)) {
    card.supportedInterfaces.forEach((entry, index) => {
      const object = bag(entry);
      if (!object) return;
      const version = typeof object.protocolVersion === "string" ? object.protocolVersion : null;
      spots.push({ where: `${site.agentCard.path} supportedInterfaces[${index}]`, version });
    });
  }
  return spots;
}

export function versionPinned(version: string | null): boolean {
  if (!version) return false;
  const value = version.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  if (/^\d+\.\d+\.\d+$/.test(value)) return true;
  return false;
}

export function checkMcpVersion(site: SiteSnapshot): CheckRow {
  const title = "MCP version pin";
  const spots = versionSpots(site);
  if (!spots.length) return row("mcp_version", title, "pass", "No MCP endpoint is advertised, so there is no version to pin.");
  const loose = spots.filter((spot) => !versionPinned(spot.version));
  if (!loose.length) return row("mcp_version", title, "pass", "Each advertised MCP endpoint pins a date or an exact version.");
  const detail = loose
    .slice(0, 4)
    .map((spot) => `${spot.where} has ${spot.version ? `"${spot.version}"` : "no version"}.`)
    .join(" ");
  return row(
    "mcp_version",
    title,
    "fail",
    `${detail} Pin a date such as 2025-06-18, or an exact version such as 1.0.0. latest, *, and ranges are not a pin.`,
    '{\n  "version": "2025-06-18"\n}',
  );
}

export function checkAgentCard(site: SiteSnapshot): CheckRow {
  const title = "Agent card";
  const failed = docFailed(site.agentCard);
  if (failed) return row("agent_card", title, "unchecked", `Could not read /.well-known/agent-card.json. ${failed}`);
  if (site.agentCard.status === 404) {
    return row("agent_card", title, "fail", "No /.well-known/agent-card.json.", cardSkeleton(site.origin));
  }
  if (site.agentCard.status !== 200) {
    return row("agent_card", title, "fail", `/.well-known/agent-card.json answered HTTP ${site.agentCard.status}.`);
  }
  const json = readJson(site.agentCard.body);
  if (!json) return row("agent_card", title, "fail", "The agent card is not JSON.", cardSkeleton(site.origin));
  const missing: string[] = [];
  for (const key of ["name", "description", "url", "version"] as const) {
    if (typeof json[key] !== "string" || !String(json[key]).trim()) missing.push(key);
  }
  if (!bag(json.capabilities)) missing.push("capabilities");
  if (!Array.isArray(json.skills) || json.skills.length === 0) missing.push("skills");
  if (missing.length) {
    return row("agent_card", title, "fail", `The agent card is missing ${missing.join(", ")}.`, cardSkeleton(site.origin));
  }
  return row("agent_card", title, "pass", "The agent card is JSON and has name, description, url, version, capabilities, and skills.");
}

function cardSkeleton(origin: string): string {
  return JSON.stringify(
    {
      name: "Your site",
      description: "One sentence about what an agent can do here.",
      url: `${origin}/mcp`,
      version: "1.0.0",
      capabilities: { streaming: false },
      skills: [{ id: "start", name: "Start here", description: "Read /skill.md and follow it." }],
    },
    null,
    2,
  );
}

export function checkMcpJson(site: SiteSnapshot): CheckRow {
  const title = "MCP manifest";
  const failed = docFailed(site.mcpJson);
  if (failed) return row("mcp_json", title, "unchecked", `Could not read /.well-known/mcp.json. ${failed}`);
  if (site.mcpJson.status === 404) {
    return row("mcp_json", title, "fail", "No /.well-known/mcp.json.", mcpSkeleton(site.origin));
  }
  if (site.mcpJson.status !== 200) return row("mcp_json", title, "fail", `/.well-known/mcp.json answered HTTP ${site.mcpJson.status}.`);
  const json = readJson(site.mcpJson.body);
  if (!json) return row("mcp_json", title, "fail", "The MCP manifest is not JSON.", mcpSkeleton(site.origin));
  if (!mcpAdvertised(json)) {
    return row("mcp_json", title, "fail", "The MCP manifest has no url.", mcpSkeleton(site.origin));
  }
  return row("mcp_json", title, "pass", "/.well-known/mcp.json is JSON and names an endpoint.");
}

function mcpSkeleton(origin: string): string {
  return JSON.stringify(
    {
      name: "your-site",
      description: "What an agent can do here.",
      version: "1.0.0",
      remotes: [{ type: "streamable-http", url: `${origin}/mcp`, version: "2025-06-18" }],
    },
    null,
    2,
  );
}

export function firstMcpUrl(site: SiteSnapshot): string | null {
  for (const item of parsedAgents(site)) {
    if (!Array.isArray(item.json.mcp)) continue;
    for (const entry of item.json.mcp) {
      const object = bag(entry);
      if (object && typeof object.url === "string" && object.url.startsWith("https://")) return object.url;
    }
  }
  const manifest = site.mcpJson.status === 200 ? readJson(site.mcpJson.body) : null;
  if (manifest) {
    if (typeof manifest.mcp === "string" && manifest.mcp.startsWith("https://")) return manifest.mcp;
    if (Array.isArray(manifest.remotes)) {
      for (const entry of manifest.remotes) {
        const object = bag(entry);
        if (object && typeof object.url === "string" && object.url.startsWith("https://")) return object.url;
      }
    }
  }
  const card = site.agentCard.status === 200 ? readJson(site.agentCard.body) : null;
  if (card && Array.isArray(card.supportedInterfaces)) {
    for (const entry of card.supportedInterfaces) {
      const object = bag(entry);
      if (object && typeof object.url === "string" && object.url.startsWith("https://")) return object.url;
    }
  }
  return null;
}

export function checkMcpReach(site: SiteSnapshot): CheckRow {
  const title = "MCP endpoint";
  const url = site.mcp?.url ?? firstMcpUrl(site);
  if (!url) return row("mcp_reach", title, "pass", "No MCP URL is advertised.");
  if (!site.mcp) return row("mcp_reach", title, "unchecked", "Could not check the MCP endpoint.");
  if (site.mcp.error && site.mcp.initializeStatus === 0) {
    return row("mcp_reach", title, "unchecked", `Could not check ${url}. ${site.mcp.error}`);
  }
  if (site.mcp.initializeStatus !== 200) {
    return row(
      "mcp_reach",
      title,
      "fail",
      `${url} did not answer initialize (HTTP ${site.mcp.initializeStatus}). No tool was called.`,
    );
  }
  if (site.mcp.listed === true) {
    return row("mcp_reach", title, "pass", `${url} answered initialize and tools/list. No tool was called.`);
  }
  if (site.mcp.listed === false) {
    return row(
      "mcp_reach",
      title,
      "warn",
      `${url} answered initialize. tools/list did not answer. No tool was called.`,
    );
  }
  return row("mcp_reach", title, "fail", `${url} answered, but the initialize body was not a JSON-RPC result. No tool was called.`);
}

export function checkSkill(site: SiteSnapshot): CheckRow {
  const title = "skill.md";
  const failed = docFailed(site.skill);
  if (failed && site.skill.status !== 404) return row("skill_md", title, "unchecked", `Could not read a skill file. ${failed}`);
  if (site.skill.status !== 200) {
    return row(
      "skill_md",
      title,
      "fail",
      "No /skill.md, /SKILL.md, /agents.md, or /AGENTS.md.",
      "# How an agent starts\n\n1. Read this file.\n2. Use the public https URLs in llms.txt.\n",
    );
  }
  if (htmlBody(site.skill)) return row("skill_md", title, "fail", `${site.skill.path} came back as HTML.`);
  if (site.skill.body.trim().length < 40) return row("skill_md", title, "fail", `${site.skill.path} is too short to onboard an agent.`);
  return row("skill_md", title, "pass", `${site.skill.path} is present.`);
}

export function checkSitemap(site: SiteSnapshot): CheckRow {
  const title = "Sitemap";
  const robotsMissing = site.robots.status === 404 || !site.robots.body.trim();
  const parsed = robotsMissing ? { sitemaps: [] as string[] } : parseRobots(site.robots.body);
  const referenced = parsed.sitemaps.length > 0;
  const fileOk = site.sitemap.status === 200 && /<loc[\s>]|<urlset[\s>]/i.test(site.sitemap.body);
  if (site.sitemap.error && site.sitemap.status !== 404) {
    return row("sitemap", title, "unchecked", `Could not read /sitemap.xml. ${site.sitemap.error}`);
  }
  if (fileOk && referenced) return row("sitemap", title, "pass", "sitemap.xml is present and robots.txt points at it.");
  if (!fileOk && !referenced) {
    return row(
      "sitemap",
      title,
      "fail",
      "No sitemap.xml, and robots.txt does not point at one.",
      `Sitemap: ${site.origin}/sitemap.xml\n\n<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site.origin}/</loc></url>\n</urlset>\n`,
    );
  }
  if (!fileOk) {
    return row("sitemap", title, "fail", "robots.txt points at a sitemap, and /sitemap.xml is missing or not a sitemap.");
  }
  return row(
    "sitemap",
    title,
    "fail",
    "sitemap.xml is there, and robots.txt does not point at it.",
    `Sitemap: ${site.origin}/sitemap.xml`,
  );
}

export function checkCrawlers(site: SiteSnapshot): CheckRow {
  const title = "Known AI crawlers";
  if (site.robots.error && site.robots.status !== 404) {
    return row("robots_crawlers", title, "unchecked", "Could not read robots.txt, so this crawl report is blank.");
  }
  const text = site.robots.status === 200 ? site.robots.body : null;
  return row("robots_crawlers", title, "pass", crawlerReport(text));
}

export function checkDirectory(site: SiteSnapshot): CheckRow {
  const title = "Agent Control directory";
  if (site.directory == null) return row("directory", title, "unchecked", "Could not check the Agent Control directory.");
  if (site.directory.names.length) {
    return row("directory", title, "pass", `Listed as ${site.directory.names.slice(0, 3).join(", ")}.`);
  }
  return row(
    "directory",
    title,
    "warn",
    "This host is not in the Agent Control directory. Listing is free.",
    "List it free at https://agent-control.net/directory",
  );
}

export function checkRegistry(site: SiteSnapshot): CheckRow {
  const title = "MCP Registry";
  if (site.registry == null) return row("registry", title, "unchecked", "Could not check the public MCP Registry.");
  if (site.registry.listed) return row("registry", title, "pass", "The public MCP Registry search included this host.");
  return row(
    "registry",
    title,
    "warn",
    "The public MCP Registry search did not include this host. That lookup can miss a listing.",
  );
}

export function freeChecks(site: SiteSnapshot): CheckRow[] {
  return [
    checkRobotsPaths(site),
    checkLlms(site),
    checkAgentsJson(site),
    checkDescriptions(site),
    checkSkill(site),
  ];
}

export function fullChecks(site: SiteSnapshot): CheckRow[] {
  return [
    ...freeChecks(site),
    checkLlmsLinks(site),
    checkBlocks(site),
    checkMcpVersion(site),
    checkAgentCard(site),
    checkMcpJson(site),
    checkMcpReach(site),
    checkSitemap(site),
    checkCrawlers(site),
    checkDirectory(site),
    checkRegistry(site),
  ];
}
