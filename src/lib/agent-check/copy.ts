/** Customer copy for the agent-readiness check. Price matches the existing $19 direct USDC payment. */

export const AGENT_CHECK_SKU = "agent_report_7d" as const;
export const AGENT_CHECK_PRICE_USD = 19;
export const AGENT_CHECK_DAYS = 7;
/** Full runs included after payment: the report, plus one re-check. */
export const AGENT_CHECK_RUNS = 2;
export const AGENT_CHECK_FREE_PER_HOUR = 30;
export const AGENT_CHECK_STARTS_PER_HOUR = 8;
export const AGENT_CHECK_MAX_BYTES = 64 * 1024;
export const AGENT_CHECK_LINK_LIMIT = 5;
export const AGENT_DESCRIPTION_MAX = 200;

export const AGENT_CHECK_PATH = "/agent-check";
export const AGENT_CHECK_API_PATH = "/api/v1/agent-check";
export const AGENT_CHECK_REPORT_PATH = "/api/v1/agent-check/report";

export const AGENT_CHECK_LINE =
  "Full report is $19. You get every check, a copy-paste fix, and one free re-check within 7 days.";
export const AGENT_CHECK_HONESTY = "We keep the fee. You pay us directly in USDC.";
export const AGENT_CHECK_PAY_LINE = "Pay on Base or Solana.";
export const AGENT_CHECK_CAVEAT =
  "A pass does not mean a crawler or an agent will use this site. We do not speak for the companies that run those crawlers or agents.";
export const AGENT_CHECK_HIRE_LINE = "Hire us, we fix it with you";
export const AGENT_CHECK_DIRECTORY_LINE =
  "List the site in the directory, free, or feature a listing for $19.";

export const AGENT_CHECK_PAGE_URL = "https://agent-control.net/agent-check";
export const AGENT_CHECK_API_URL = "https://agent-control.net/api/v1/agent-check";
export const AGENT_CHECK_REPORT_URL = "https://agent-control.net/api/v1/agent-check/report";

export const FREE_CHECK_IDS = [
  "robots_paths",
  "llms_txt",
  "agents_json",
  "descriptions",
  "skill_md",
] as const;
