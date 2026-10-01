/**
 * Human App copy for connector consent and /privacy.
 * Consent names the registered client and callback. It does not assume every
 * client is Claude. Meter stays off these surfaces. No poll_url / must_abort / abort jargon.
 */

import { HUMAN_PRINCIPAL_LINE } from "../storefront.ts";

export const SUPPORT_EMAIL = "support@agent-control.net";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export const PRIVACY_EYEBROW = "Privacy";
export const PRIVACY_HEADLINE = "Privacy";
export const PRIVACY_LEDE = "We do not hold your keys. We do not sell your data.";
export const PRIVACY_KEEP_HEADING = "What we keep";
export const PRIVACY_BODY =
  "We keep your account, the agent wallets you enroll, and spend-check history so Approval Inbox can work. You stay the customer of record.";
export const PRIVACY_CONTACT = `Questions: ${SUPPORT_EMAIL}`;

export const CONSENT_EYEBROW = "Connector consent";
export const CONSENT_HEADLINE = "Let this app ask before a send";
export const CONSENT_LEDE = "You stay the customer of record. You keep the keys.";
export const CONSENT_WHAT_HEADING = "What this app can do";
export const CONSENT_WHAT = [
  "Ask Agent Control before a send",
  "Wait for your Approval Inbox decision",
  "Read pricing, start a trial, and open checkout for you",
] as const;
export const CONSENT_HUMAN_LINE = HUMAN_PRINCIPAL_LINE;
export const CONSENT_KEYS = "You keep the keys. This app does not get your wallet keys.";
export const CONSENT_ALLOW = "Allow";
export const CONSENT_DENY = "Deny";
export const CONSENT_PICK_AGENT = "Choose which agent this app may check";
export const CONSENT_NO_AGENTS = "Add an agent wallet in the dashboard first, then come back.";
export const CONSENT_SIGN_IN = "Sign in to continue";
export const CONSENT_APP_LABEL = "Registered app";
export const CONSENT_REDIRECT_LABEL = "Sends the code to";
export const CONSENT_LOOPBACK =
  "This callback stays on this computer. Only continue if you started this connection.";

export const MCP_HUMAN_SCOPE = "mcp:human";
