import { track } from "@vercel/analytics";

function trackEvent(name: "list_agent_submit" | "featured_start"): void {
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
