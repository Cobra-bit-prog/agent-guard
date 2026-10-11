import { track } from "@vercel/analytics";

function trackEvent(
  name:
    | "list_agent_submit"
    | "featured_start"
    | "check_run"
    | "report_start"
    | "agent_check_run"
    | "agent_report_start",
): void {
  if (typeof window === "undefined") return;
  track(name);
}

/** Someone submitted the free directory form and the listing was saved. */
export function trackListAgentSubmit(): void {
  trackEvent("list_agent_submit");
}

/** Someone started a Featured payment (the $19 / 7 days invoice exists). */
export function trackFeaturedStart(): void {
  trackEvent("featured_start");
}

/** Someone ran the free x402 listing check. */
export function trackCheckRun(): void {
  trackEvent("check_run");
}

/** Someone started the $19 x402 report payment. */
export function trackReportStart(): void {
  trackEvent("report_start");
}

/** Someone ran the free agent-readiness check. */
export function trackAgentCheckRun(): void {
  trackEvent("agent_check_run");
}

/** Someone started the $19 agent-readiness report payment. */
export function trackAgentReportStart(): void {
  trackEvent("agent_report_start");
}
