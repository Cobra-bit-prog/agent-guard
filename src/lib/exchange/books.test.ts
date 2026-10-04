import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  ExchangeBooksError,
  attachPayIn,
  classifyIncoming,
  createOpenJob,
  exchangeBalances,
  getJob,
  listFundedBoard,
  recordHirerOk,
  recordWorkerOk,
  releaseDueJobs,
  releaseHeldJob,
  type ExchangeQuery,
} from "./books.ts";
import { SOLANA_PAYOUT_ADDRESS, USDC_MINT, feeUsdc, fullAmountUsdc, usdcEqual, workerShareUsdc } from "./money.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = join(ROOT, "migrations/0025_exchange_jobs.sql");
const PAYER = "Hirer11111111111111111111111111111111111111";
const WORKER = "Workr11111111111111111111111111111111111111";
const NOW = new Date("2026-10-04T12:00:00.000Z");
const DEADLINE = "2026-10-06T12:00:00.000Z";
const BEFORE = new Date("2026-10-05T12:00:00.000Z");
const AT_DEADLINE = new Date("2026-10-06T12:00:00.000Z");

function wrap(db: PGlite): ExchangeQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

async function openDb(): Promise<{ db: PGlite; q: ExchangeQuery }> {
  const db = new PGlite();
  await db.exec(`
    create table pay_requests (
      id text primary key,
      signature text,
      amount_usdc integer,
      status text
    );
    create table meter_invoices (
      id text primary key,
      signature text,
      amount_usd numeric,
      status text
    );
    create table spend_audit_invoices (
      id text primary key,
      signature text,
      amount_usd numeric,
      status text
    );
  `);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  return { db, q: wrap(db) };
}

async function listJob(q: ExchangeQuery, amount = 40) {
  return createOpenJob(
    q,
    {
      title: "Read the public page",
      summary: "Write what changed. No login and no private data.",
      poster_kind: "human",
      amount_usdc: amount,
      deadline_at: DEADLINE,
    },
    NOW,
  );
}

async function holdJob(q: ExchangeQuery, amount: number, signature: string) {
  const open = await listJob(q, amount);
  const held = await attachPayIn(q, {
    jobId: open.id,
    signature,
    payerAddress: PAYER,
    amountUsdc: amount,
  });
  return held;
}

describe("exchange money split", () => {
  it("keeps the existing checkout wallet and USDC mint", () => {
    assert.equal(SOLANA_PAYOUT_ADDRESS, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.equal(USDC_MINT, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  });

  it("splits whole USDC into a 90% transfer and a 10% label with nothing left over", () => {
    assert.equal(workerShareUsdc(40), "36");
    assert.equal(feeUsdc(40), "4");
    assert.equal(fullAmountUsdc(40), "40");
    assert.equal(workerShareUsdc(25), "22.5");
    assert.equal(feeUsdc(25), "2.5");
    assert.equal(workerShareUsdc(1), "0.9");
    assert.equal(feeUsdc(1), "0.1");
  });
});

describe("exchange books on a throwaway database", () => {
  it("stores amount_usdc as integer whole USDC, matching pay_requests", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    assert.match(sql, /amount_usdc integer not null/);
    assert.match(sql, /fee_usdc numeric not null default 0/);
    assert.doesNotMatch(readFileSync(join(ROOT, "src/lib/exchange/books.ts"), "utf8"), /@solana\/web3|sendTransaction|sendRawTransaction|signTransaction/);
    const page = readFileSync(join(ROOT, "src/routes/exchange.tsx"), "utf8");
    assert.doesNotMatch(page, /solana:/);
    assert.doesNotMatch(page, /49QioAKP/);
    assert.doesNotMatch(page, /One-page market brief|Draft the customer email|Check before deploy/);
    assert.doesNotMatch(page, /Turn a call into tasks|Summarize a public report|Answer one support thread/);
    assert.doesNotMatch(page, /\$40|\$25|\$60|\$18|\$20|\$15/);
    assert.match(page, /Hire an agent\. Pay only when the job is done\./);
    assert.match(page, /Nothing listed yet/);
    assert.match(page, /Listing is free/);
    assert.match(page, /You pay the full price first/);
    assert.match(page, /You pay the full price in USDC/);
    assert.match(page, /we hold the money/i);
    assert.match(page, /worker is paid, and we keep 10%, only when the buyer says the job is done/);
    assert.match(page, /full price goes back/);
    assert.match(page, /we keep nothing/);
    assert.doesNotMatch(page, /pay nothing up front/i);
    assert.equal((page.match(/USDC/g) ?? []).length, 1);
    assert.doesNotMatch(page, /Card shape|funded|hirer|escrow|Test copy|does not send|Nothing is locked|on Solana|USDC mint/i);
    assert.doesNotMatch(page, /No open jobs yet|ninety percent|We keep ten|founding tier|0% under/i);
    assert.doesNotMatch(readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8"), /exchange/i);
    assert.doesNotMatch(readFileSync(join(ROOT, "src/routes/_app/billing.pay.tsx"), "utf8"), /exchange/i);
  });

  it("refuses an earned pay_requests signature and leaves the job open", async () => {
    const { db, q } = await openDb();
    await db.query(
      `insert into pay_requests (id, signature, amount_usdc, status) values ($1, $2, $3, $4)`,
      ["pay_1", "earned_pay_requests_sig", 49, "paid"],
    );
    const open = await listJob(q, 40);
    await assert.rejects(
      () =>
        attachPayIn(q, {
          jobId: open.id,
          signature: "earned_pay_requests_sig",
          payerAddress: PAYER,
          amountUsdc: 40,
        }),
      /already earned/,
    );
    const job = await getJob(q, open.id);
    assert.equal(job.status, "open");
    assert.equal(job.pay_in_signature, null);
    assert.equal(job.payer_address, null);
    assert.equal(await classifyIncoming(q, "earned_pay_requests_sig"), "earned");
    await assert.rejects(
      () =>
        q.query(
          `update exchange_jobs set status = 'held', payer_address = $1, pay_in_signature = $2 where id = $3`,
          [PAYER, "earned_pay_requests_sig", open.id],
        ),
      /earned signature cannot be attached/,
    );
    assert.equal((await getJob(q, open.id)).status, "open");
  });

  it("refuses an earned meter_invoices signature", async () => {
    const { db, q } = await openDb();
    await db.query(
      `insert into meter_invoices (id, signature, amount_usd, status) values ($1, $2, $3, $4)`,
      ["meter_1", "earned_meter_sig", 0.25, "paid"],
    );
    const open = await listJob(q, 25);
    await assert.rejects(
      () =>
        attachPayIn(q, {
          jobId: open.id,
          signature: "earned_meter_sig",
          payerAddress: PAYER,
          amountUsdc: 25,
        }),
      /already earned/,
    );
    await assert.rejects(
      () =>
        q.query(
          `update exchange_jobs set status = 'held', payer_address = $1, pay_in_signature = $2 where id = $3`,
          [PAYER, "earned_meter_sig", open.id],
        ),
      /earned signature cannot be attached/,
    );
    assert.equal((await getJob(q, open.id)).status, "open");
    assert.equal(await classifyIncoming(q, "earned_meter_sig"), "earned");
  });

  it("refuses an earned spend_audit_invoices signature", async () => {
    const { db, q } = await openDb();
    await db.query(
      `insert into spend_audit_invoices (id, signature, amount_usd, status) values ($1, $2, $3, $4)`,
      ["audit_1", "earned_audit_sig", 49, "paid"],
    );
    const open = await listJob(q, 49);
    await assert.rejects(
      () =>
        attachPayIn(q, {
          jobId: open.id,
          signature: "earned_audit_sig",
          payerAddress: PAYER,
          amountUsdc: 49,
        }),
      /already earned/,
    );
    await assert.rejects(
      () =>
        q.query(
          `update exchange_jobs set status = 'held', payer_address = $1, pay_in_signature = $2 where id = $3`,
          [PAYER, "earned_audit_sig", open.id],
        ),
      /earned signature cannot be attached/,
    );
    assert.equal((await getJob(q, open.id)).status, "open");
    assert.equal(await classifyIncoming(q, "earned_audit_sig"), "earned");
  });

  it("holds the full amount with the payer address and pay-in signature", async () => {
    const { q } = await openDb();
    const held = await holdJob(q, 40, "payin_hold_full");
    assert.equal(held.status, "held");
    assert.equal(held.amount_usdc, 40);
    assert.equal(held.payer_address, PAYER);
    assert.equal(held.pay_in_signature, "payin_hold_full");
    assert.equal(held.fee_usdc, "0");
    assert.equal(held.payout_signature, null);
    assert.equal(await classifyIncoming(q, "payin_hold_full"), "held");
    const books = await exchangeBalances(q);
    assert.equal(books.held_usdc, 40);
    assert.equal(books.earned_fee_usdc, "0");
    await assert.rejects(
      () =>
        attachPayIn(q, {
          jobId: held.id,
          signature: "payin_partial",
          payerAddress: PAYER,
          amountUsdc: 20,
        }),
      /full job price|Only an open job/,
    );
  });

  it("leaves an unmatched incoming transfer unmatched", async () => {
    const { db, q } = await openDb();
    const before = await db.query<{ n: string }>(`select count(*)::text as n from exchange_jobs`);
    assert.equal(before.rows[0]?.n, "0");
    assert.equal(await classifyIncoming(q, "chain_transfer_nobody_claimed"), "unmatched");
    const after = await db.query<{ n: string }>(`select count(*)::text as n from exchange_jobs`);
    assert.equal(after.rows[0]?.n, "0");
    const earned = await db.query(
      `select signature from pay_requests where signature = $1
       union all select signature from meter_invoices where signature = $1
       union all select signature from spend_audit_invoices where signature = $1`,
      ["chain_transfer_nobody_claimed"],
    );
    assert.equal(earned.rows.length, 0);
    const books = await exchangeBalances(q);
    assert.equal(books.held_usdc, 0);
    assert.equal(books.earned_fee_usdc, "0");
  });

  it("marks done with one 90% outgoing transfer and a 10% fee label", async () => {
    const { q } = await openDb();
    const held = await holdJob(q, 25, "payin_done_25");
    const waiting = await recordHirerOk(q, held.id, BEFORE);
    assert.equal(waiting.job.status, "held");
    assert.equal(waiting.transfer, null);
    assert.equal(waiting.job.fee_usdc, "0");
    const done = await recordWorkerOk(q, held.id, WORKER, BEFORE);
    assert.equal(done.job.status, "done");
    assert.equal(done.job.fee_usdc, "2.5");
    assert.equal(done.job.fee_usdc, feeUsdc(25));
    assert.ok(done.transfer);
    assert.equal(done.transfer.kind, "worker_90");
    assert.equal(done.transfer.amount_usdc, "22.5");
    assert.equal(done.transfer.amount_usdc, workerShareUsdc(25));
    assert.equal(done.transfer.to, WORKER);
    assert.equal(done.transfer.job_id, held.id);
    assert.equal(done.job.payout_signature, done.transfer.signature);
    assert.equal(done.job.payout_to, WORKER);
    assert.match(done.transfer.signature, /^sim_out_worker_90_/);
    const again = await releaseHeldJob(q, held.id, AT_DEADLINE);
    assert.equal(again.transfer, null);
    assert.equal(again.job.payout_signature, done.transfer.signature);
    assert.equal(again.job.status, "done");
    const books = await exchangeBalances(q);
    assert.equal(books.held_usdc, 0);
    assert.equal(books.earned_fee_usdc, "2.5");
    assert.equal(await classifyIncoming(q, "payin_done_25"), "settled");
  });

  it("refunds 100% on one outgoing transfer and keeps fee at 0", async () => {
    const { q } = await openDb();
    const held = await holdJob(q, 40, "payin_refund_40");
    const refunded = await releaseHeldJob(q, held.id, AT_DEADLINE);
    assert.equal(refunded.job.status, "refunded");
    assert.equal(refunded.job.fee_usdc, "0");
    assert.equal(refunded.job.payout_to, PAYER);
    assert.ok(refunded.transfer);
    assert.equal(refunded.transfer.kind, "refund_100");
    assert.equal(refunded.transfer.amount_usdc, "40");
    assert.ok(usdcEqual(refunded.transfer.amount_usdc, fullAmountUsdc(40)));
    assert.equal(refunded.transfer.to, PAYER);
    assert.equal(refunded.job.payout_signature, refunded.transfer.signature);
    assert.match(refunded.transfer.signature, /^sim_out_refund_100_/);
    assert.notEqual(refunded.transfer.signature, `sim_out_worker_90_${held.id}`);
    const books = await exchangeBalances(q);
    assert.equal(books.held_usdc, 0);
    assert.equal(books.earned_fee_usdc, "0");
  });

  it("refunds 100% when nobody answers by the deadline", async () => {
    const { q } = await openDb();
    const held = await holdJob(q, 18, "payin_silence");
    const early = await releaseDueJobs(q, BEFORE);
    assert.equal(early.length, 0);
    assert.equal((await getJob(q, held.id)).status, "held");
    const due = await releaseDueJobs(q, AT_DEADLINE);
    assert.equal(due.length, 1);
    assert.equal(due[0]?.job.status, "refunded");
    assert.equal(due[0]?.job.hirer_ok_at, null);
    assert.equal(due[0]?.job.worker_ok_at, null);
    assert.equal(due[0]?.job.fee_usdc, "0");
    assert.equal(due[0]?.transfer?.kind, "refund_100");
    assert.equal(due[0]?.transfer?.amount_usdc, "18");
    assert.equal(due[0]?.transfer?.to, PAYER);
  });

  it("stays held when the two sides disagree, then refunds at the deadline", async () => {
    const { q } = await openDb();
    const held = await holdJob(q, 60, "payin_disagree");
    const hirerOnly = await recordHirerOk(q, held.id, BEFORE);
    assert.equal(hirerOnly.job.status, "held");
    assert.equal(hirerOnly.transfer, null);
    assert.equal(hirerOnly.job.fee_usdc, "0");
    assert.equal(hirerOnly.job.payout_signature, null);
    assert.ok(hirerOnly.job.hirer_ok_at);
    assert.equal(hirerOnly.job.worker_ok_at, null);
    const still = await releaseHeldJob(q, held.id, BEFORE);
    assert.equal(still.job.status, "held");
    assert.equal(still.transfer, null);
    const refunded = await releaseHeldJob(q, held.id, AT_DEADLINE);
    assert.equal(refunded.job.status, "refunded");
    assert.equal(refunded.job.fee_usdc, "0");
    assert.equal(refunded.transfer?.kind, "refund_100");
    assert.equal(refunded.transfer?.amount_usdc, "60");
    assert.equal(refunded.transfer?.to, PAYER);
    assert.equal(refunded.job.payout_to, PAYER);
  });

  it("stays held when only the worker says ok, then refunds at the deadline", async () => {
    const { q } = await openDb();
    const held = await holdJob(q, 15, "payin_worker_only");
    const workerOnly = await recordWorkerOk(q, held.id, WORKER, BEFORE);
    assert.equal(workerOnly.job.status, "held");
    assert.equal(workerOnly.transfer, null);
    assert.equal(workerOnly.job.payout_to, WORKER);
    assert.equal(workerOnly.job.payout_signature, null);
    assert.equal(workerOnly.job.fee_usdc, "0");
    const refunded = await releaseDueJobs(q, AT_DEADLINE);
    assert.equal(refunded.length, 1);
    assert.equal(refunded[0]?.job.status, "refunded");
    assert.equal(refunded[0]?.job.payout_to, PAYER);
    assert.equal(refunded[0]?.transfer?.to, PAYER);
    assert.equal(refunded[0]?.transfer?.amount_usdc, "15");
    assert.equal(refunded[0]?.job.fee_usdc, "0");
    assert.match(refunded[0]?.job.payout_signature ?? "", /^sim_out_refund_100_/);
  });

  it("pays 90% when both say ok before the deadline and does not refund later", async () => {
    const { q } = await openDb();
    const held = await holdJob(q, 40, "payin_both_ok");
    await recordWorkerOk(q, held.id, WORKER, BEFORE);
    const done = await recordHirerOk(q, held.id, BEFORE);
    assert.equal(done.job.status, "done");
    assert.equal(done.transfer?.kind, "worker_90");
    assert.equal(done.transfer?.amount_usdc, "36");
    assert.equal(done.job.fee_usdc, "4");
    const later = await releaseDueJobs(q, AT_DEADLINE);
    assert.equal(later.length, 0);
    assert.equal((await getJob(q, held.id)).status, "done");
    assert.equal((await getJob(q, held.id)).payout_signature, done.transfer?.signature);
  });

  it("does not mix two job ids on one outgoing transfer", async () => {
    const { q } = await openDb();
    const first = await holdJob(q, 40, "payin_lump_a");
    const second = await holdJob(q, 25, "payin_lump_b");
    await recordHirerOk(q, first.id, BEFORE);
    const doneA = await recordWorkerOk(q, first.id, WORKER, BEFORE);
    await recordHirerOk(q, second.id, BEFORE);
    const doneB = await recordWorkerOk(q, second.id, WORKER, BEFORE);
    assert.notEqual(doneA.transfer?.signature, doneB.transfer?.signature);
    assert.equal(doneA.transfer?.amount_usdc, "36");
    assert.equal(doneB.transfer?.amount_usdc, "22.5");
    assert.equal(doneA.transfer?.job_id, first.id);
    assert.equal(doneB.transfer?.job_id, second.id);
    const books = await exchangeBalances(q);
    assert.equal(books.held_usdc, 0);
    assert.equal(books.earned_fee_usdc, "6.5");
    const rows = await q.query<{ id: string; payout_signature: string }>(
      `select id, payout_signature from exchange_jobs order by created_at`,
    );
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((row) => row.payout_signature)).size, 2);
  });

  it("ignores payment fields on a free listing", async () => {
    const { q } = await openDb();
    const card = await createOpenJob(
      q,
      {
        title: "List an agent",
        summary: "Free to post. No pay-in on this row.",
        poster_kind: "agent",
        amount_usdc: 10,
        deadline_at: DEADLINE,
        status: "done",
        pay_in_signature: "should_not_stick",
        fee_usdc: 99,
      },
      NOW,
    );
    assert.equal(card.status, "open");
    assert.equal(card.poster_kind, "agent");
    const job = await getJob(q, card.id);
    assert.equal(job.pay_in_signature, null);
    assert.equal(job.fee_usdc, "0");
    assert.equal(job.payer_address, null);
  });

  it("rejects a pay-in from the checkout wallet", async () => {
    const { q } = await openDb();
    const open = await listJob(q, 10);
    await assert.rejects(
      () =>
        attachPayIn(q, {
          jobId: open.id,
          signature: "payin_from_house",
          payerAddress: SOLANA_PAYOUT_ADDRESS,
          amountUsdc: 10,
        }),
      /receive wallet/,
    );
    assert.equal((await getJob(q, open.id)).status, "open");
  });
});

describe("funded shelf", () => {
  it("keeps unpaid listings off the shelf and prints zeros until a job is released", async () => {
    const { q } = await openDb();
    const open = await listJob(q, 12);
    let board = await listFundedBoard(q);
    assert.deepEqual(board.jobs, []);
    assert.equal(board.stats.locked_usdc, 0);
    assert.equal(board.stats.released_count, 0);
    assert.equal(board.stats.kept_usdc, "0");

    const held = await attachPayIn(q, {
      jobId: open.id,
      signature: "payin_shelf_12",
      payerAddress: PAYER,
      amountUsdc: 12,
    });
    await listJob(q, 7);
    board = await listFundedBoard(q);
    assert.equal(board.jobs.length, 1);
    assert.equal(board.jobs[0]?.id, held.id);
    assert.equal(board.jobs[0]?.amount_usdc, 12);
    assert.equal(board.jobs[0]?.poster_kind, "human");
    assert.equal(board.jobs[0]?.title, "Read the public page");
    assert.equal("pay_in_signature" in (board.jobs[0] as object), false);
    assert.equal("payer_address" in (board.jobs[0] as object), false);
    assert.equal(board.stats.locked_usdc, 12);
    assert.equal(board.stats.released_count, 0);
    assert.equal(board.stats.kept_usdc, "0");

    await recordHirerOk(q, held.id, BEFORE);
    await recordWorkerOk(q, held.id, WORKER, BEFORE);
    board = await listFundedBoard(q);
    assert.deepEqual(board.jobs, []);
    assert.equal(board.stats.locked_usdc, 0);
    assert.equal(board.stats.released_count, 1);
    assert.equal(board.stats.kept_usdc, feeUsdc(12));
  });
});

describe("listing validation", () => {
  it("requires a future deadline and a whole amount", async () => {
    await assert.rejects(
      () =>
        createOpenJob(
          { query: async () => [] },
          { title: "x", summary: "y", poster_kind: "human", amount_usdc: 1.5, deadline_at: DEADLINE },
          NOW,
        ),
      (err: unknown) => err instanceof ExchangeBooksError && /whole USDC/.test(err.message),
    );
  });
});
