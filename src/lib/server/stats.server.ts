import { timingSafeEqual } from "node:crypto";
import type { Sql } from "@/lib/db";

export type AccountStats = {
  signedUp: number;
  unverified: number;
  freeOrTrial: number;
  paid: { starter: number; pro: number; team: number };
  generatedAt: string;
};

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
     where s.plan in ('starter', 'pro', 'team')
       and (s.period_ends_at is null or s.period_ends_at > now())
     group by s.plan`,
  );
  const freeRows = await sql.query<{ n: number }>(
    `select count(*)::int as n
     from "user" u
     left join subscriptions s on s.user_id = u.id
     where s.user_id is null
        or s.plan = 'free'
        or (s.plan in ('starter', 'pro', 'team') and s.period_ends_at is not null and s.period_ends_at <= now())`,
  );
  const paid = { starter: 0, pro: 0, team: 0 };
  for (const row of paidRows) {
    if (row.plan === "starter" || row.plan === "pro" || row.plan === "team") {
      paid[row.plan] = asInt(row.n);
    }
  }
  return {
    signedUp: asInt(users[0]?.signed_up),
    unverified: asInt(users[0]?.unverified),
    freeOrTrial: asInt(freeRows[0]?.n),
    paid,
    generatedAt: new Date().toISOString(),
  };
}

export async function emailAccountStats(stats: AccountStats): Promise<void> {
  const to = process.env.STATS_REPORT_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!to || !apiKey) {
    if (to && !apiKey) console.error("[stats] RESEND_API_KEY is not set; report email skipped");
    return;
  }
  const from = process.env.EMAIL_FROM?.trim() || "Agent Control <noreply@agent-control.net>";
  const body =
    `Agent Control daily stats (${stats.generatedAt})\n\n` +
    `Signed up: ${stats.signedUp}\n` +
    `Unverified: ${stats.unverified}\n` +
    `Free/trial: ${stats.freeOrTrial}\n` +
    `Paid Starter: ${stats.paid.starter}\n` +
    `Paid Pro: ${stats.paid.pro}\n` +
    `Paid Team: ${stats.paid.team}\n`;
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
