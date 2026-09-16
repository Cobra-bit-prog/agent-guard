import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Sql } from "../db.ts";
import {
  authorizeInternalStats,
  collectAccountLeads,
  collectAccountStats,
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
      if (text.includes("count(*)::int as n") && text.includes(FREE_OR_TRIAL_SQL)) return [{ n: 1 }];
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
      if (text.includes(ACCOUNT_LEAD_EMAIL_VERIFIED) && text.includes('"emailVerified" is not true')) {
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
    const freeCountSql = texts.find((text) => text.includes("count(*)::int as n") && text.includes(FREE_OR_TRIAL_SQL));
    const freeListSql = texts.find(
      (text) => text.includes("u.email") && text.includes(FREE_OR_TRIAL_SQL) && !text.includes("count(*)"),
    );
    assert.ok(freeCountSql, "count query uses FREE_OR_TRIAL_SQL");
    assert.ok(freeListSql, "list query uses FREE_OR_TRIAL_SQL");
    assert.match(FREE_OR_TRIAL_SQL, /s\.plan = 'free'/);
    assert.match(FREE_OR_TRIAL_SQL, /period_ends_at <= now\(\)/);
  });
});
