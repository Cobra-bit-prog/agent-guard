import { absoluteAppUrl } from "./warning-alert.ts";

/** Query param on `/inbox` that highlights one pending hold. */
export const INBOX_HOLD_QUERY = "hold";

/** Exact timeout copy: no action means the agent must abort. */
export const HOLD_TIMEOUT_IS_BLOCK =
  "If you do nothing, the hold expires and the agent must abort (treated as a block).";

export type InboxHoldCopyOpts = {
  agentName: string;
  message?: string;
  approvalId?: string | null;
  valueUsd?: number;
  to?: string;
};

export type InboxHoldEmailCopy = {
  subject: string;
  title: string;
  bodyLines: string[];
  ctaPath: string;
  ctaLabel: string;
};

export type SlackTextObject =
  | { type: "plain_text"; text: string; emoji?: boolean }
  | { type: "mrkdwn"; text: string };

export type SlackBlock =
  | { type: "section"; text: SlackTextObject }
  | {
      type: "actions";
      elements: Array<{
        type: "button";
        text: { type: "plain_text"; text: string };
        url: string;
      }>;
    };

export type SlackIncomingWebhookPayload = {
  text: string;
  blocks: SlackBlock[];
};

/** Dedup token so each approval id notifies once (not 45 min per agent). */
export function holdNoticeToken(approvalId: string): string {
  return `[hold:${approvalId}]`;
}

export function holdNoticeMessage(approvalId: string, message: string): string {
  return `${holdNoticeToken(approvalId)} ${message}`;
}

export function inboxHoldPath(approvalId?: string | null): string {
  const id = approvalId?.trim();
  if (!id) return "/inbox";
  return `/inbox?${INBOX_HOLD_QUERY}=${encodeURIComponent(id)}`;
}

export function inboxHoldUrl(approvalId?: string | null): string {
  return absoluteAppUrl(inboxHoldPath(approvalId));
}

export function isHttpsWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function webhookLogChannel(url: string): "slack" | "webhook" {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    if (host === "hooks.slack.com" || host.endsWith(".slack.com")) return "slack";
  } catch {
    /* ignore */
  }
  return "webhook";
}

function shortDest(address: string, chars = 6): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

function usdLabel(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

export function formatHoldAmountDest(opts: { valueUsd?: number; to?: string }): string | null {
  const parts: string[] = [];
  if (typeof opts.valueUsd === "number" && Number.isFinite(opts.valueUsd)) {
    parts.push(usdLabel(opts.valueUsd));
  }
  const dest = opts.to?.trim();
  if (dest) parts.push(`→ ${shortDest(dest)}`);
  if (parts.length === 0) return null;
  return parts.join(" ");
}

export function inboxHoldEmailCopy(opts: InboxHoldCopyOpts): InboxHoldEmailCopy {
  const agent = opts.agentName.trim() || "An agent";
  const detail = opts.message?.trim() ?? "";
  const amountDest = formatHoldAmountDest({ valueUsd: opts.valueUsd, to: opts.to });
  const bodyLines = [
    `${agent} has a hold in Approval Inbox.`,
    ...(amountDest ? [amountDest] : []),
    ...(detail && detail !== amountDest ? [detail] : []),
    "Allow once, always allow this address, or block. Holds expire in 10 minutes.",
    HOLD_TIMEOUT_IS_BLOCK,
  ];
  return {
    subject: "Agent Control: hold needs a look",
    title: "A spend is waiting for you",
    bodyLines,
    ctaPath: inboxHoldPath(opts.approvalId),
    ctaLabel: "Open Approval Inbox",
  };
}

export function inboxHoldWebhookPayload(opts: InboxHoldCopyOpts & { ctaUrl: string }): SlackIncomingWebhookPayload {
  const copy = inboxHoldEmailCopy(opts);
  const ctaUrl = opts.ctaUrl.trim() || inboxHoldUrl(opts.approvalId);
  const text = [copy.title, ...copy.bodyLines, ctaUrl].join(" ");
  const mrkdwn = [`*${copy.title}*`, ...copy.bodyLines.map((line) => line)].join("\n");
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: mrkdwn } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: copy.ctaLabel },
            url: ctaUrl,
          },
        ],
      },
    ],
  };
}

export function inboxHoldTelegramText(opts: InboxHoldCopyOpts & { ctaUrl: string }): string {
  const copy = inboxHoldEmailCopy(opts);
  const ctaUrl = opts.ctaUrl.trim() || inboxHoldUrl(opts.approvalId);
  return [...copy.bodyLines, "", `${copy.ctaLabel}:`, ctaUrl].join("\n");
}

/**
 * POST Slack incoming-webhook JSON. Returns false on skip/failure. Never throws.
 */
export async function postSlackIncomingWebhook(
  url: string,
  payload: SlackIncomingWebhookPayload,
): Promise<boolean> {
  if (!isHttpsWebhookUrl(url)) return false;
  try {
    const response = await fetch(url.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("[notify] slack webhook failed", response.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] slack webhook failed", err);
    return false;
  }
}
