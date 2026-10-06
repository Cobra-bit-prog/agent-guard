import { timingSafeEqual } from "node:crypto";
import type { Sql } from "@/lib/db";
import { isUndefinedTable } from "../exchange/listings.ts";
import {
  EMPTY_JOB_BOARD_STATS,
  splitJobBoardStats,
  type JobBoardStats,
} from "../exchange/seed-jobs.ts";

/** Cash already received for human inbox plans. Not an active seat. */
export type CashReceived = {
  usdc: number;
  /** Paid starter/pro/team invoices, including seats whose period has ended. */
  everPaid: number;
};

export type AccountStats = {
  signedUp: number;
  unverified: number;
  freeOrTrial: number;
  paid: { starter: number; pro: number; team: number };
  cashReceived: CashReceived;
  partners: Record<string, number>;
  /** Open job-board posts, split so seed jobs are not read as outside demand. */
  jobBoard: JobBoardStats;
  generatedAt: string;
};

export type AccountLead = {
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  plan: string | null;
  status: string | null;
  trial_ends_at: string | null;
  period_ends_at: string | null;
};

export type UnpaidStarterCheckout = {
  id: string;
  guest_email: string | null;
  amount: number;
  status: string;
  created_at: string;
};

export type AccountLeads = {
  generatedAt: string;
  freeOrTrial: AccountLead[];
  unverified: AccountLead[];
  unpaidStarterCheckouts: UnpaidStarterCheckout[];
  cashReceived: CashReceived;
};

/** Same free/trial definition as collectAccountStats. Expired paid plans stay here. */
export const FREE_OR_TRIAL_SQL = `s.user_id is null
        or s.plan = 'free'
        or (s.plan in ('starter', 'pro', 'team') and s.period_ends_at is not null and s.period_ends_at <= now())`;

/** Active paid seats only. A null period stays active; an ended period does not. */
export const ACTIVE_PAID_SEAT_SQL = `s.plan in ('starter', 'pro', 'team')
       and (s.period_ends_at is null or s.period_ends_at > now())`;

/**
 * Human inbox cash already received. Period end does not remove a paid invoice.
 * Action Gate and Shop Shield are not inbox seats and stay out of this sum.
 */
export const CASH_RECEIVED_SQL = `coalesce(p.source, 'human') = 'human'
         and p.plan in ('starter', 'pro', 'team')
         and p.status = 'paid'`;

const EMPTY_CASH: CashReceived = { usdc: 0, everPaid: 0 };

const ACCOUNT_LEAD_SELECT = `
  u.email,
  u.name,
  u."createdAt" as created_at,
  u."emailVerified" as email_verified,
  s.plan,
  s.status,
  s.trial_ends_at,
  s.period_ends_at
`;

function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizeInternalStats(request: Request): "missing" | "denied" | "ok" {
  const secret = process.env.INTERNAL_STATS_SECRET?.trim();
  if (!secret) return "missing";
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const cron = request.headers.get("x-vercel-cron") === "1";
  if (cron || (bearer && secretsEqual(bearer, secret))) return "ok";
  return "denied";
}

function asInt(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asUsdc(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function formatUsdcAmount(amount: number): string {
  const rounded = asUsdc(amount);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function asIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = String(value);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return text;
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

type AccountLeadRow = {
  email: string | null;
  name: string | null;
  created_at: unknown;
  email_verified: unknown;
  plan: string | null;
  status: string | null;
  trial_ends_at: unknown;
  period_ends_at: unknown;
};

function mapAccountLead(row: AccountLeadRow): AccountLead {
  return {
    email: String(row.email ?? "").trim(),
    name: String(row.name ?? ""),
    createdAt: asIso(row.created_at) ?? "",
    emailVerified: asBool(row.email_verified),
    plan: row.plan ?? null,
    status: row.status ?? null,
    trial_ends_at: asIso(row.trial_ends_at),
    period_ends_at: asIso(row.period_ends_at),
  };
}

export async function collectCashReceived(sql: Sql): Promise<CashReceived> {
  try {
    const rows = await sql.query<{ ever_paid: number; cash_usdc: unknown }>(
      `select count(*)::int as ever_paid,
              coalesce(sum(coalesce(p.paid_amount_usdc, p.amount_usdc)), 0) as cash_usdc
       from pay_requests p
       where ${CASH_RECEIVED_SQL}`,
    );
    return {
      usdc: asUsdc(rows[0]?.cash_usdc),
      everPaid: asInt(rows[0]?.ever_paid),
    };
  } catch {
    console.error("[stats] cash received query failed");
    return EMPTY_CASH;
  }
}

export async function collectJobBoardStats(sql: Sql): Promise<JobBoardStats> {
  try {
    const rows = await sql.query<{ id: string; contact: string | null }>(
      `select id, contact
       from exchange_jobs
       where status = 'open' and hidden_at is null`,
    );
    return splitJobBoardStats(rows);
  } catch (err) {
    if (!isUndefinedTable(err)) console.error("[stats] job board query failed");
    return EMPTY_JOB_BOARD_STATS;
  }
}

export async function collectAccountStats(sql: Sql): Promise<AccountStats> {
  const users = await sql.query<{ signed_up: number; unverified: number }>(
    `select count(*)::int as signed_up,
            count(*) filter (where "emailVerified" is not true)::int as unverified
     from "user"`,
  );
  const paidRows = await sql.query<{ plan: string; n: number }>(
    `select s.plan, count(*)::int as n
     from "user" u
     join subscriptions s on s.user_id = u.id
     where ${ACTIVE_PAID_SEAT_SQL}
     group by s.plan`,
  );
  const cashReceived = await collectCashReceived(sql);
  const freeRows = await sql.query<{ n: number }>(
    `select count(*)::int as n
     from "user" u
     left join subscriptions s on s.user_id = u.id
     where ${FREE_OR_TRIAL_SQL}`,
  );
  const paid = { starter: 0, pro: 0, team: 0 };
  for (const row of paidRows) {
    if (row.plan === "starter" || row.plan === "pro" || row.plan === "team") {
      paid[row.plan] = asInt(row.n);
    }
  }
  const partners: Record<string, number> = {};
  try {
    const partnerRows = await sql.query<{ partner_source: string; n: number }>(
      `select partner_source, count(*)::int as n
       from user_partner_source
       group by partner_source
       order by n desc`,
    );
    for (const row of partnerRows) {
      const slug = String(row.partner_source ?? "");
      if (slug) partners[slug] = asInt(row.n);
    }
  } catch {
    console.error("[stats] partner_source query failed");
  }
  return {
    signedUp: asInt(users[0]?.signed_up),
    unverified: asInt(users[0]?.unverified),
    freeOrTrial: asInt(freeRows[0]?.n),
    paid,
    cashReceived,
    partners,
    jobBoard: await collectJobBoardStats(sql),
    generatedAt: new Date().toISOString(),
  };
}

export async function collectAccountLeads(sql: Sql): Promise<AccountLeads> {
  const freeOrTrialRows = await sql.query<AccountLeadRow>(
    `select ${ACCOUNT_LEAD_SELECT}
     from "user" u
     left join subscriptions s on s.user_id = u.id
     where ${FREE_OR_TRIAL_SQL}
     order by u."createdAt" desc`,
  );
  const unverifiedRows = await sql.query<AccountLeadRow>(
    `select ${ACCOUNT_LEAD_SELECT}
     from "user" u
     left join subscriptions s on s.user_id = u.id
     where u."emailVerified" is not true
     order by u."createdAt" desc`,
  );
  let unpaidStarterCheckouts: UnpaidStarterCheckout[] = [];
  try {
    const checkoutRows = await sql.query<{
      id: string;
      guest_email: string | null;
      amount: unknown;
      status: string;
      created_at: unknown;
    }>(
      `select p.id,
              coalesce(nullif(btrim(p.guest_email), ''), u.email) as guest_email,
              p.amount_usdc as amount,
              p.status,
              p.created_at
       from pay_requests p
       left join "user" u on u.id = p.user_id
       where coalesce(p.source, 'human') = 'human'
         and p.plan = 'starter'
         and p.status in ('pending', 'underpaid')
       order by p.created_at desc`,
    );
    unpaidStarterCheckouts = checkoutRows.map((row) => ({
      id: String(row.id),
      guest_email: row.guest_email?.trim() || null,
      amount: asInt(row.amount),
      status: String(row.status ?? ""),
      created_at: asIso(row.created_at) ?? "",
    }));
  } catch {
    console.error("[stats] unpaid starter checkout query failed");
  }
  return {
    generatedAt: new Date().toISOString(),
    freeOrTrial: freeOrTrialRows.map(mapAccountLead),
    unverified: unverifiedRows.map(mapAccountLead),
    unpaidStarterCheckouts,
    cashReceived: await collectCashReceived(sql),
  };
}

/** Human register text. Paid lines stay period-based; cash is a separate ledger line. */
export function formatAccountStatsReport(stats: AccountStats): string {
  const partnerLines = Object.entries(stats.partners)
    .map(([slug, n]) => `Partner ${slug}: ${n}`)
    .join("\n");
  return (
    `Agent Control daily stats (${stats.generatedAt})\n\n` +
    `Signed up: ${stats.signedUp}\n` +
    `Unverified: ${stats.unverified}\n` +
    `Free/trial: ${stats.freeOrTrial}\n` +
    `Paid Starter: ${stats.paid.starter}\n` +
    `Paid Pro: ${stats.paid.pro}\n` +
    `Paid Team: ${stats.paid.team}\n` +
    `Cash received / ever paid: ${formatUsdcAmount(stats.cashReceived.usdc)} USDC (${stats.cashReceived.everPaid})\n` +
    `Job board open: ${stats.jobBoard.open}\n` +
    `Job board outside posts: ${stats.jobBoard.outside}\n` +
    `Job board seed posts: ${stats.jobBoard.seed}\n` +
    (partnerLines ? `\n${partnerLines}\n` : "")
  );
}

export async function emailAccountStats(stats: AccountStats): Promise<void> {
  const to = process.env.STATS_REPORT_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!to || !apiKey) {
    if (to && !apiKey) console.error("[stats] RESEND_API_KEY is not set; report email skipped");
    return;
  }
  const from = process.env.EMAIL_FROM?.trim() || "Agent Control <noreply@agent-control.net>";
  const body = formatAccountStatsReport(stats);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Agent Control daily stats",
      text: body,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("[stats] Resend report failed", response.status, text);
  }
}

export type ResendVerificationResult = {
  found: number;
  sent: number;
  failed: number;
};

export async function resendUnverifiedConfirmations(sql: Sql): Promise<ResendVerificationResult> {
  const { auth } = await import("@/lib/auth/server");
  const rows = await sql.query<{ email: string }>(
    `select email from "user"
     where "emailVerified" is not true
       and email is not null
       and btrim(email) <> ''`,
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const email = row.email?.trim();
    if (!email) continue;
    try {
      await auth.api.sendVerificationEmail({
        body: { email, callbackURL: "/dashboard" },
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error("[stats] resend verification failed");
    }
  }
  return { found: rows.length, sent, failed };
}
