import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Sql } from "../db.ts";
import { SEED_JOB_CONTACT, SEED_JOB_IDS } from "../exchange/seed-jobs.ts";
import {
  ACTIVE_PAID_SEAT_SQL,
  authorizeInternalStats,
  CASH_RECEIVED_SQL,
  collectAccountLeads,
  collectAccountStats,
  collectJobBoardStats,
  formatAccountStatsReport,
  FREE_OR_TRIAL_SQL,
} from "./stats.server.ts";

const ACCOUNT_LEAD_EMAIL_VERIFIED = 'u."emailVerified" as email_verified';

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://agent-control.net/api/v1/internal/accounts", { headers });
}

function mockSql(handler: (text: string) => unknown[]): { sql: Sql; texts: string[] } {
  const texts: string[] = [];
  const query = async <T>(text: string): Promise<T[]> => {
    texts.push(text);
    return handler(text) as T[];
  };
  const sql = (async () => []) as unknown as Sql;
  sql.query = query;
  return { sql, texts };
}

describe("authorizeInternalStats", () => {
  it("returns missing when INTERNAL_STATS_SECRET is unset", () => {
    const prev = process.env.INTERNAL_STATS_SECRET;
    delete process.env.INTERNAL_STATS_SECRET;
    try {
      assert.equal(authorizeInternalStats(req({ authorization: "Bearer x" })), "missing");
    } finally {
      if (prev == null) delete process.env.INTERNAL_STATS_SECRET;
      else process.env.INTERNAL_STATS_SECRET = prev;
    }
  });

  it("accepts Bearer INTERNAL_STATS_SECRET and rejects a bad token", () => {
    const prev = process.env.INTERNAL_STATS_SECRET;
    process.env.INTERNAL_STATS_SECRET = "stats-secret";
    try {
      assert.equal(authorizeInternalStats(req({ authorization: "Bearer stats-secret" })), "ok");
      assert.equal(authorizeInternalStats(req({ authorization: "Bearer nope" })), "denied");
      assert.equal(authorizeInternalStats(req()), "denied");
    } finally {
      if (prev == null) delete process.env.INTERNAL_STATS_SECRET;
      else process.env.INTERNAL_STATS_SECRET = prev;
    }
  });
});

describe("collectAccountLeads", () => {
  it("lists free/trial with the same predicate as collectAccountStats", async () => {
    const created = new Date("2026-09-01T12:00:00.000Z");
    const lead = {
      email: "free@example.com",
      name: "Free User",
      created_at: created,
      email_verified: false,
      plan: "free",
      status: "active",
      trial_ends_at: "2026-09-02T12:00:00.000Z",
      period_ends_at: null,
    };
    const { sql, texts } = mockSql((text) => {
      if (text.includes("count(*)::int as signed_up")) return [{ signed_up: 2, unverified: 1 }];
      if (text.includes("count(*)::int as n") && text.includes(FREE_OR_TRIAL_SQL))
        return [{ n: 1 }];
      if (text.includes("group by s.plan")) return [];
      if (text.includes("user_partner_source")) return [];
      if (text.includes("from pay_requests p")) {
        return [
          {
            id: "pay_1",
            guest_email: "guest@example.com",
            amount: 29,
            status: "pending",
            created_at: created,
          },
        ];
      }
      if (
        text.includes(ACCOUNT_LEAD_EMAIL_VERIFIED) &&
        text.includes('"emailVerified" is not true')
      ) {
        return [lead];
      }
      if (text.includes(ACCOUNT_LEAD_EMAIL_VERIFIED) && text.includes(FREE_OR_TRIAL_SQL)) {
        return [lead];
      }
      return [];
    });

    const stats = await collectAccountStats(sql);
    const leads = await collectAccountLeads(sql);

    assert.equal(stats.freeOrTrial, 1);
    assert.deepEqual(leads.freeOrTrial, [
      {
        email: "free@example.com",
        name: "Free User",
        createdAt: "2026-09-01T12:00:00.000Z",
        emailVerified: false,
        plan: "free",
        status: "active",
        trial_ends_at: "2026-09-02T12:00:00.000Z",
        period_ends_at: null,
      },
    ]);
    assert.equal(leads.unverified.length, 1);
    assert.equal(leads.unverified[0]?.email, "free@example.com");
    assert.deepEqual(leads.unpaidStarterCheckouts, [
      {
        id: "pay_1",
        guest_email: "guest@example.com",
        amount: 29,
        status: "pending",
        created_at: "2026-09-01T12:00:00.000Z",
      },
    ]);
    assert.match(leads.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    const freeCountSql = texts.find(
      (text) => text.includes("count(*)::int as n") && text.includes(FREE_OR_TRIAL_SQL),
    );
    const freeListSql = texts.find(
      (text) =>
        text.includes("u.email") && text.includes(FREE_OR_TRIAL_SQL) && !text.includes("count(*)"),
    );
    assert.ok(freeCountSql, "count query uses FREE_OR_TRIAL_SQL");
    assert.ok(freeListSql, "list query uses FREE_OR_TRIAL_SQL");
    assert.match(FREE_OR_TRIAL_SQL, /s\.plan = 'free'/);
    assert.match(FREE_OR_TRIAL_SQL, /period_ends_at <= now\(\)/);
    assert.deepEqual(leads.cashReceived, { usdc: 0, everPaid: 0 });
    assert.deepEqual(stats.cashReceived, { usdc: 0, everPaid: 0 });
  });
});

describe("expired Starter is not an active seat", () => {
  const expiredLead = {
    email: "starter-expired@example.com",
    name: "Expired Starter",
    created_at: new Date("2026-09-01T00:00:00.000Z"),
    email_verified: true,
    plan: "starter",
    status: "active",
    trial_ends_at: null,
    period_ends_at: "2026-09-28T00:00:00.000Z",
  };

  it("keeps the seat at zero and still counts the historical Starter payment", async () => {
    const { sql, texts } = mockSql((text) => {
      if (text.includes("count(*)::int as signed_up")) return [{ signed_up: 1, unverified: 0 }];
      if (text.includes("group by s.plan")) {
        const periodGate =
          text.includes(ACTIVE_PAID_SEAT_SQL) && /period_ends_at > now\(\)/.test(text);
        if (!periodGate) return [{ plan: "starter", n: 1 }];
        return [];
      }
      if (text.includes("cash_usdc")) {
        const ledger =
          text.includes(CASH_RECEIVED_SQL) &&
          text.includes("paid_amount_usdc") &&
          text.includes("status = 'paid'") &&
          !text.includes("period_ends_at");
        if (!ledger) return [{ ever_paid: 0, cash_usdc: 0 }];
        return [{ ever_paid: 1, cash_usdc: "29.000000" }];
      }
      if (text.includes("count(*)::int as n") && text.includes(FREE_OR_TRIAL_SQL))
        return [{ n: 1 }];
      if (text.includes("user_partner_source")) return [];
      if (text.includes(ACCOUNT_LEAD_EMAIL_VERIFIED) && text.includes(FREE_OR_TRIAL_SQL)) {
        return [expiredLead];
      }
      if (text.includes("from pay_requests p")) return [];
      return [];
    });

    const stats = await collectAccountStats(sql);
    const leads = await collectAccountLeads(sql);

    assert.equal(stats.paid.starter, 0);
    assert.equal(stats.paid.pro, 0);
    assert.equal(stats.paid.team, 0);
    assert.equal(stats.freeOrTrial, 1);
    assert.deepEqual(stats.cashReceived, { usdc: 29, everPaid: 1 });
    assert.deepEqual(leads.cashReceived, { usdc: 29, everPaid: 1 });
    assert.equal(leads.freeOrTrial[0]?.plan, "starter");
    assert.equal(leads.freeOrTrial[0]?.period_ends_at, "2026-09-28T00:00:00.000Z");

    const paidSql = texts.find((text) => text.includes("group by s.plan"));
    const cashSql = texts.find((text) => text.includes("as cash_usdc"));
    assert.ok(paidSql, "active paid query ran");
    assert.ok(cashSql, "cash received query ran");
    assert.match(paidSql, /period_ends_at > now\(\)/);
    assert.match(FREE_OR_TRIAL_SQL, /period_ends_at <= now\(\)/);
    assert.match(CASH_RECEIVED_SQL, /p\.plan in \('starter', 'pro', 'team'\)/);
    assert.doesNotMatch(cashSql, /period_ends_at/);
    assert.doesNotMatch(CASH_RECEIVED_SQL, /action|shield/);

    const report = formatAccountStatsReport(stats);
    assert.match(report, /Paid Starter: 0\n/);
    assert.match(report, /Cash received \/ ever paid: 29 USDC \(1\)\n/);
    assert.doesNotMatch(report, /Paid Starter: 1/);
  });

  it("still counts a Starter whose period has not ended", async () => {
    const { sql } = mockSql((text) => {
      if (text.includes("count(*)::int as signed_up")) return [{ signed_up: 1, unverified: 0 }];
      if (text.includes("group by s.plan")) {
        if (!text.includes("period_ends_at > now()")) return [];
        return [{ plan: "starter", n: 1 }];
      }
      if (text.includes("cash_usdc")) return [{ ever_paid: 1, cash_usdc: 29 }];
      if (text.includes("count(*)::int as n") && text.includes(FREE_OR_TRIAL_SQL))
        return [{ n: 0 }];
      return [];
    });

    const stats = await collectAccountStats(sql);
    assert.equal(stats.paid.starter, 1);
    assert.equal(stats.freeOrTrial, 0);
    assert.deepEqual(stats.cashReceived, { usdc: 29, everPaid: 1 });
    const report = formatAccountStatsReport(stats);
    assert.match(report, /Paid Starter: 1\n/);
    assert.match(report, /Cash received \/ ever paid: 29 USDC \(1\)\n/);
    assert.match(
      report,
      /Job board open: 0\nJob board outside posts: 0\nJob board seed posts: 0\n/,
    );
  });
});

describe("job board scoreboard", () => {
  function accountSql(handler: (text: string) => unknown[]) {
    return mockSql((text) => {
      if (text.includes("exchange_jobs")) return handler(text);
      if (text.includes("count(*)::int as signed_up")) return [{ signed_up: 0, unverified: 0 }];
      if (text.includes("group by s.plan")) return [];
      if (text.includes("cash_usdc")) return [{ ever_paid: 0, cash_usdc: 0 }];
      if (text.includes("count(*)::int as n") && text.includes(FREE_OR_TRIAL_SQL))
        return [{ n: 0 }];
      return [];
    });
  }

  it("counts a seed id and a support@ post apart from an outside job", async () => {
    const { sql } = accountSql(() => [
      { id: SEED_JOB_IDS[0], contact: "ada@example.com" },
      { id: "job_from_outside", contact: "ada@example.com" },
      { id: "job_ours_by_contact", contact: SEED_JOB_CONTACT },
    ]);
    const board = await collectJobBoardStats(sql);
    assert.deepEqual(board, { open: 3, outside: 1, seed: 2 });
    const stats = await collectAccountStats(sql);
    assert.deepEqual(stats.jobBoard, board);
    const report = formatAccountStatsReport(stats);
    assert.match(
      report,
      /Job board open: 3\nJob board outside posts: 1\nJob board seed posts: 2\n/,
    );
  });

  it("reports zeros when the job board table is not on this database yet", async () => {
    const { sql } = accountSql(() => {
      const err = new Error('relation "exchange_jobs" does not exist');
      Object.assign(err, { code: "42P01" });
      throw err;
    });
    assert.deepEqual(await collectJobBoardStats(sql), { open: 0, outside: 0, seed: 0 });
    const stats = await collectAccountStats(sql);
    assert.equal(stats.signedUp, 0);
    assert.deepEqual(stats.jobBoard, { open: 0, outside: 0, seed: 0 });
  });
});
