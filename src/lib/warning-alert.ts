import type { VerdictAction } from "./policy.ts";

export type WarningAlertKind = "hold" | "alert" | "near_limit" | "block";

export const APP_ORIGIN = "https://agent-control.net";

/** Skip a second email of the same user + agent + kind within this window. */
export const WARNING_EMAIL_DEDUP_MS = 45 * 60 * 1000;

export function warningNoticeToken(kind: WarningAlertKind, agentId: string): string {
  return `[${kind}:${agentId}]`;
}

export function warningNoticeMessage(
  kind: WarningAlertKind,
  agentId: string,
  message: string,
): string {
  return `${warningNoticeToken(kind, agentId)} ${message}`;
}

export function isWithinDedupWindow(
  previousAt: string | null | undefined,
  nowMs: number,
  windowMs = WARNING_EMAIL_DEDUP_MS,
): boolean {
  if (!previousAt) return false;
  const t = new Date(previousAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t < windowMs;
}

/**
 * One email per check. Block / hold / policy-alert beat a near-limit ping
 * so we do not send two mails (or two console rows) for the same spend.
 */
export function warningKindForDecision(
  action: VerdictAction,
  nearLimit: boolean,
): WarningAlertKind | null {
  if (action === "block") return "block";
  if (action === "hold") return "hold";
  if (action === "alert") return "alert";
  if (nearLimit) return "near_limit";
  return null;
}

export function shouldInsertNearLimitAlert(action: VerdictAction, nearLimit: boolean): boolean {
  return nearLimit && action === "allow";
}

export function absoluteAppUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${APP_ORIGIN}${p}`;
}
