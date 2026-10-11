export type RobotsRule = { allow: boolean; path: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

export type ParsedRobots = {
  groups: RobotsGroup[];
  sitemaps: string[];
};

/** Known crawler names. The check reports the file. It does not score a crawl policy. */
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "meta-externalagent",
  "FacebookBot",
  "cohere-ai",
] as const;

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      lastWasAgent = false;
      continue;
    }
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      if (value) current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap" && value) {
      sitemaps.push(value);
      continue;
    }
    if (!current) {
      current = { agents: ["*"], rules: [] };
      groups.push(current);
    }
    if (key === "allow" && value) current.rules.push({ allow: true, path: value });
    if (key === "disallow" && value) current.rules.push({ allow: false, path: value });
  }
  return { groups, sitemaps };
}

export function starGroup(groups: readonly RobotsGroup[]): RobotsGroup | null {
  return groups.find((group) => group.agents.includes("*")) ?? groups[0] ?? null;
}

function ruleMatch(rule: string, path: string): { match: boolean; length: number } {
  const end = rule.endsWith("$");
  const body = end ? rule.slice(0, -1) : rule;
  const length = body.replaceAll("*", "").length;
  if (!body.includes("*")) {
    return { match: end ? path === body : path.startsWith(body), length };
  }
  const escaped = body.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const re = new RegExp(end ? `^${escaped}$` : `^${escaped}`);
  return { match: re.test(path), length };
}

/** RFC 9309: longest matching Allow or Disallow wins. A tie allows. */
export function pathAllowed(rules: readonly RobotsRule[], path: string): boolean {
  let bestLength = -1;
  let allowed = true;
  for (const rule of rules) {
    const found = ruleMatch(rule.path, path);
    if (!found.match || found.length < bestLength) continue;
    if (found.length === bestLength && !rule.allow) continue;
    bestLength = found.length;
    allowed = rule.allow;
  }
  return allowed;
}

export function groupForAgent(groups: readonly RobotsGroup[], agent: string): RobotsGroup | null {
  const name = agent.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLen = -1;
  for (const group of groups) {
    for (const token of group.agents) {
      if (token === "*") {
        if (bestLen < 0) {
          best = group;
          bestLen = 0;
        }
        continue;
      }
      if (name === token && token.length >= bestLen) {
        best = group;
        bestLen = token.length;
      }
    }
  }
  return best;
}

export function blockedAgentPaths(robotsText: string, paths: readonly string[]): string[] {
  const parsed = parseRobots(robotsText);
  const group = starGroup(parsed.groups);
  if (!group) return [];
  return paths.filter((path) => path !== "/" && !pathAllowed(group.rules, path));
}

function summarizeRules(rules: readonly RobotsRule[]): string {
  if (rules.length === 0) return "no Allow or Disallow lines";
  const allows = rules.filter((rule) => rule.allow).map((rule) => rule.path);
  const blocks = rules.filter((rule) => !rule.allow).map((rule) => rule.path);
  const parts: string[] = [];
  if (allows.length) parts.push(`allows ${allows.slice(0, 4).join(", ")}`);
  if (blocks.length) parts.push(`disallows ${blocks.slice(0, 4).join(", ")}`);
  return parts.join("; ") || "no Allow or Disallow lines";
}

/** Factual report. Callers should not treat a block as a failed policy. */
export function crawlerReport(robotsText: string | null): string {
  const lead = "This reports what robots.txt says about known AI crawlers. It is not a verdict on your policy.";
  if (robotsText == null) {
    return `${lead} There is no robots.txt. Crawlers use their own default.`;
  }
  const parsed = parseRobots(robotsText);
  const star = starGroup(parsed.groups);
  const starSummary = star ? summarizeRules(star.rules) : "no rules";
  const lines: string[] = [];
  const seen = new Map<string, string[]>();
  for (const name of AI_CRAWLERS) {
    const group = groupForAgent(parsed.groups, name);
    const named = group?.agents.includes(name.toLowerCase()) ?? false;
    const summary = named && group
      ? `its own group ${summarizeRules(group.rules)}`
      : `the * group (${starSummary})`;
    const list = seen.get(summary) ?? [];
    list.push(name);
    seen.set(summary, list);
  }
  for (const [summary, names] of seen) {
    lines.push(`${names.join(", ")}: ${summary}.`);
  }
  return `${lead} ${lines.join(" ")}`.slice(0, 1200);
}
