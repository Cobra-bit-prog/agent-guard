import { randomBytes } from "node:crypto";
import { assertPayerIsNotReceiveWallet, isSolanaPayReference } from "../solana-pay.ts";
import {
  feeUsdc,
  fullAmountUsdc,
  normalizeUsdc,
  sumUsdc,
  usdcEqual,
  workerShareUsdc,
} from "./money.ts";

export class ExchangeBooksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExchangeBooksError";
  }
}

export type PosterKind = "human" | "agent";
export type ExchangeStatus = "open" | "held" | "done" | "refunded";
export type IncomingClass = "earned" | "held" | "settled" | "unmatched";
export type OutgoingKind = "worker_90" | "refund_100";

export type ExchangeJob = {
  id: string;
  title: string;
  summary: string;
  poster_kind: PosterKind;
  amount_usdc: number;
  status: ExchangeStatus;
  payer_address: string | null;
  pay_in_signature: string | null;
  payout_signature: string | null;
  payout_to: string | null;
  deadline_at: string;
  hirer_ok_at: string | null;
  worker_ok_at: string | null;
  fee_usdc: string;
  created_at: string;
};

export type OpenJobCard = {
  id: string;
  title: string;
  summary: string;
  poster_kind: PosterKind;
  amount_usdc: number;
  status: "open";
  deadline_at: string;
  created_at: string;
};

/** One simulated outgoing transfer. Never signed and never sent. */
export type SimulatedOutgoing = {
  job_id: string;
  signature: string;
  to: string;
  amount_usdc: string;
  kind: OutgoingKind;
};

export type ExchangeBalances = {
  held_usdc: number;
  earned_fee_usdc: string;
};

export type WalletMoneyTag = "held" | "earned";

/** Money still held. This tag is never profit. */
export type HeldMoneyTag = {
  tag: "held";
  usdc: string;
  profit: false;
};

/** The 10% books label after the buyer says the job is done. Not a second transfer. */
export type EarnedMoneyTag = {
  tag: "earned";
  usdc: string;
};

export type SameWalletTags = {
  held: HeldMoneyTag;
  earned: EarnedMoneyTag;
  /** Full prices still held, plus the 10% label kept on done jobs. Not profit. */
  wallet_balance_usdc: string;
  /** Only the earned tag. Held cash is never included. */
  profit_usdc: string;
};

export interface ExchangeQuery {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type JobRow = {
  id: string;
  title: string;
  summary: string;
  poster_kind: string;
  amount_usdc: number | string;
  status: string;
  payer_address: string | null;
  pay_in_signature: string | null;
  payout_signature: string | null;
  payout_to: string | null;
  deadline_at: Date | string;
  hirer_ok_at: Date | string | null;
  worker_ok_at: Date | string | null;
  fee_usdc: string | number;
  created_at: Date | string;
};

const LISTING_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const JOB_COLUMNS = `id, title, summary, poster_kind, amount_usdc, status, payer_address,
  pay_in_signature, payout_signature, payout_to, deadline_at, hirer_ok_at, worker_ok_at,
  fee_usdc, created_at`;

export function isUndefinedTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "42P01") return true;
  const message = err instanceof Error ? err.message : "";
  return /exchange_jobs/i.test(message) && /does not exist/i.test(message);
}

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ExchangeBooksError("Invalid timestamp");
  }
  return parsed.toISOString();
}

function asStatus(value: string): ExchangeStatus {
  if (value === "open" || value === "held" || value === "done" || value === "refunded") return value;
  throw new ExchangeBooksError(`Unknown job status: ${value}`);
}

function asPoster(value: string): PosterKind {
  if (value === "human" || value === "agent") return value;
  throw new ExchangeBooksError("poster_kind must be human or agent");
}

function mapJob(row: JobRow): ExchangeJob {
  const amount = Number(row.amount_usdc);
  if (!Number.isInteger(amount)) throw new ExchangeBooksError("amount_usdc must stay a whole number");
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    poster_kind: asPoster(row.poster_kind),
    amount_usdc: amount,
    status: asStatus(row.status),
    payer_address: row.payer_address,
    pay_in_signature: row.pay_in_signature,
    payout_signature: row.payout_signature,
    payout_to: row.payout_to,
    deadline_at: iso(row.deadline_at) ?? "",
    hirer_ok_at: iso(row.hirer_ok_at),
    worker_ok_at: iso(row.worker_ok_at),
    fee_usdc: normalizeUsdc(row.fee_usdc),
    created_at: iso(row.created_at) ?? "",
  };
}

function toCard(job: ExchangeJob): OpenJobCard {
  if (job.status !== "open") throw new ExchangeBooksError("Only open jobs are on the public board");
  return {
    id: job.id,
    title: job.title,
    summary: job.summary,
    poster_kind: job.poster_kind,
    amount_usdc: job.amount_usdc,
    status: "open",
    deadline_at: job.deadline_at,
    created_at: job.created_at,
  };
}

function solanaAddress(value: string, label: string): string {
  const address = value.trim();
  if (!isSolanaPayReference(address)) {
    throw new ExchangeBooksError(`${label} must be a Solana address`);
  }
  assertPayerIsNotReceiveWallet(address);
  return address;
}

function oneOutgoing(input: {
  jobId: string;
  to: string;
  amountUsdc: string;
  kind: OutgoingKind;
}): SimulatedOutgoing {
  return {
    job_id: input.jobId,
    signature: `sim_out_${input.kind}_${input.jobId}`,
    to: input.to,
    amount_usdc: input.amountUsdc,
    kind: input.kind,
  };
}

export function parseListing(input: unknown, now: Date): {
  title: string;
  summary: string;
  poster_kind: PosterKind;
  amount_usdc: number;
  deadline_at: Date;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ExchangeBooksError("Listing body must be an object");
  }
  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!title) throw new ExchangeBooksError("Title is required");
  if (title.length > 140) throw new ExchangeBooksError("Title must be 140 characters or less");
  if (!summary) throw new ExchangeBooksError("Summary is required");
  if (summary.length > 2000) throw new ExchangeBooksError("Summary must be 2000 characters or less");
  if (body.poster_kind !== "human" && body.poster_kind !== "agent") {
    throw new ExchangeBooksError("poster_kind must be human or agent");
  }
  if (typeof body.amount_usdc !== "number" || !Number.isInteger(body.amount_usdc)) {
    throw new ExchangeBooksError("Amount must be a whole USDC amount");
  }
  if (body.amount_usdc < 1 || body.amount_usdc > 1_000_000) {
    throw new ExchangeBooksError("Amount must be from 1 to 1000000 USDC");
  }
  if (typeof body.deadline_at !== "string") {
    throw new ExchangeBooksError("Deadline is required");
  }
  const deadline = new Date(body.deadline_at);
  if (Number.isNaN(deadline.getTime())) throw new ExchangeBooksError("Deadline is not a valid time");
  if (deadline.getTime() <= now.getTime()) {
    throw new ExchangeBooksError("Deadline must be in the future");
  }
  if (deadline.getTime() - now.getTime() > LISTING_WINDOW_MS) {
    throw new ExchangeBooksError("Deadline must be within 90 days");
  }
  return {
    title,
    summary,
    poster_kind: body.poster_kind,
    amount_usdc: body.amount_usdc,
    deadline_at: deadline,
  };
}

export async function createOpenJob(
  db: ExchangeQuery,
  input: unknown,
  now: Date,
): Promise<OpenJobCard> {
  const listing = parseListing(input, now);
  const id = `exj_${randomBytes(8).toString("hex")}`;
  const rows = await db.query<JobRow>(
    `insert into exchange_jobs
      (id, title, summary, poster_kind, amount_usdc, status, deadline_at, fee_usdc)
     values ($1, $2, $3, $4, $5, 'open', $6, 0)
     returning ${JOB_COLUMNS}`,
    [id, listing.title, listing.summary, listing.poster_kind, listing.amount_usdc, listing.deadline_at.toISOString()],
  );
  const row = rows[0];
  if (!row) throw new ExchangeBooksError("Listing was not saved");
  const job = mapJob(row);
  if (job.status !== "open" || job.pay_in_signature || job.payer_address || job.fee_usdc !== "0") {
    throw new ExchangeBooksError("A new listing must stay open and unpaid");
  }
  return toCard(job);
}

export async function listOpenJobs(db: ExchangeQuery): Promise<OpenJobCard[]> {
  const rows = await db.query<JobRow>(
    `select ${JOB_COLUMNS} from exchange_jobs where status = 'open' order by created_at desc`,
  );
  return rows.map((row) => toCard(mapJob(row)));
}

export type FundedJobCard = {
  id: string;
  title: string;
  summary: string;
  poster_kind: PosterKind;
  amount_usdc: number;
  deadline_at: string;
};

/** Numbers the public page can print. Held jobs only; open listings stay off the shelf. */
export type ExchangeBoardStats = {
  locked_usdc: number;
  released_count: number;
  kept_usdc: string;
};

export async function listFundedBoard(
  db: ExchangeQuery,
): Promise<{ jobs: FundedJobCard[]; stats: ExchangeBoardStats }> {
  const rows = await db.query<JobRow>(
    `select ${JOB_COLUMNS} from exchange_jobs
     where status = 'held'
     order by deadline_at asc
     limit 100`,
  );
  const statsRows = await db.query<{ locked_usdc: string; released_count: string; kept_usdc: string }>(
    `select
       coalesce(sum(amount_usdc) filter (where status = 'held'), 0)::text as locked_usdc,
       coalesce(count(*) filter (where status = 'done'), 0)::text as released_count,
       coalesce(sum(fee_usdc) filter (where status = 'done'), 0)::text as kept_usdc
     from exchange_jobs`,
  );
  const stats = statsRows[0];
  const locked = Number(stats?.locked_usdc ?? 0);
  const released = Number(stats?.released_count ?? 0);
  return {
    jobs: rows.map((row) => {
      const job = mapJob(row);
      if (job.status !== "held") throw new ExchangeBooksError("The public shelf only lists funded jobs");
      return {
        id: job.id,
        title: job.title,
        summary: job.summary,
        poster_kind: job.poster_kind,
        amount_usdc: job.amount_usdc,
        deadline_at: job.deadline_at,
      };
    }),
    stats: {
      locked_usdc: Number.isInteger(locked) ? locked : 0,
      released_count: Number.isInteger(released) ? released : 0,
      kept_usdc: normalizeUsdc(stats?.kept_usdc ?? 0),
    },
  };
}

export async function getJob(db: ExchangeQuery, id: string): Promise<ExchangeJob> {
  const rows = await db.query<JobRow>(
    `select ${JOB_COLUMNS} from exchange_jobs where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new ExchangeBooksError("Job not found");
  return mapJob(row);
}

async function isEarnedSignature(db: ExchangeQuery, signature: string): Promise<boolean> {
  const rows = await db.query<{ found: number }>(
    `select 1 as found from pay_requests where signature = $1
     union all
     select 1 from meter_invoices where signature = $1
     union all
     select 1 from spend_audit_invoices where signature = $1
     limit 1`,
    [signature],
  );
  return rows.length > 0;
}

async function findJobByPayIn(db: ExchangeQuery, signature: string): Promise<ExchangeJob | null> {
  const rows = await db.query<JobRow>(
    `select ${JOB_COLUMNS} from exchange_jobs where pay_in_signature = $1`,
    [signature],
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

/**
 * Tag an incoming signature. This does not write.
 * Earned invoices stay earned. A held job stores the full amount.
 * A signature on no row stays unmatched — not ours, and not a job.
 * Done or refunded jobs are settled. Their full amount is not profit.
 */
export async function classifyIncoming(db: ExchangeQuery, signature: string): Promise<IncomingClass> {
  const sig = signature.trim();
  if (!sig) throw new ExchangeBooksError("Signature is required");
  if (await isEarnedSignature(db, sig)) return "earned";
  const job = await findJobByPayIn(db, sig);
  if (!job) return "unmatched";
  if (job.status === "held") return "held";
  return "settled";
}

export async function attachPayIn(
  db: ExchangeQuery,
  input: { jobId: string; signature: string; payerAddress: string; amountUsdc: number },
): Promise<ExchangeJob> {
  const signature = input.signature.trim();
  if (!signature) throw new ExchangeBooksError("Pay-in signature is required");
  const payer = solanaAddress(input.payerAddress, "Payer address");
  if (!Number.isInteger(input.amountUsdc) || input.amountUsdc <= 0) {
    throw new ExchangeBooksError("Pay-in must be the full price in whole USDC");
  }
  if (await isEarnedSignature(db, signature)) {
    throw new ExchangeBooksError("That signature is already earned. It cannot be attached to a job.");
  }
  const existing = await findJobByPayIn(db, signature);
  if (existing) throw new ExchangeBooksError("That signature is already on a job.");

  const job = await getJob(db, input.jobId);
  if (job.status !== "open") throw new ExchangeBooksError("Only an open job can take a pay-in");
  if (input.amountUsdc !== job.amount_usdc) {
    throw new ExchangeBooksError("Pay-in must be the full job price");
  }

  const rows = await db.query<JobRow>(
    `update exchange_jobs
     set status = 'held', payer_address = $2, pay_in_signature = $3, fee_usdc = 0
     where id = $1 and status = 'open' and pay_in_signature is null
     returning ${JOB_COLUMNS}`,
    [job.id, payer, signature],
  );
  const updated = rows[0] ? mapJob(rows[0]) : null;
  if (!updated) throw new ExchangeBooksError("Job was not open");
  if (updated.status !== "held") throw new ExchangeBooksError("Pay-in did not hold the job");
  if (updated.amount_usdc !== job.amount_usdc) throw new ExchangeBooksError("Hold changed the price");
  if (updated.payer_address !== payer) throw new ExchangeBooksError("Payer address was not stored");
  if (updated.pay_in_signature !== signature) throw new ExchangeBooksError("Pay-in signature was not stored");
  if (updated.fee_usdc !== "0") throw new ExchangeBooksError("Fee must stay 0 while the job is held");
  if (updated.payout_signature) throw new ExchangeBooksError("A hold must not record a payout");
  return updated;
}

function bothOkInTime(job: ExchangeJob): boolean {
  if (!job.hirer_ok_at || !job.worker_ok_at || !job.payout_to) return false;
  const deadline = Date.parse(job.deadline_at);
  return Date.parse(job.hirer_ok_at) <= deadline && Date.parse(job.worker_ok_at) <= deadline;
}

async function settleDone(
  db: ExchangeQuery,
  job: ExchangeJob,
): Promise<{ job: ExchangeJob; transfer: SimulatedOutgoing }> {
  if (!job.payout_to) throw new ExchangeBooksError("Worker wallet is missing");
  const worker = workerShareUsdc(job.amount_usdc);
  const fee = feeUsdc(job.amount_usdc);
  const transfer = oneOutgoing({
    jobId: job.id,
    to: job.payout_to,
    amountUsdc: worker,
    kind: "worker_90",
  });
  const rows = await db.query<JobRow>(
    `update exchange_jobs
     set status = 'done', fee_usdc = $2, payout_signature = $3, payout_to = $4
     where id = $1 and status = 'held' and payout_signature is null
       and hirer_ok_at is not null and worker_ok_at is not null
     returning ${JOB_COLUMNS}`,
    [job.id, fee, transfer.signature, job.payout_to],
  );
  const updated = rows[0] ? mapJob(rows[0]) : null;
  if (!updated) throw new ExchangeBooksError("Job could not be marked done");
  if (updated.payout_signature !== transfer.signature) {
    throw new ExchangeBooksError("Done must record the one worker transfer");
  }
  if (!usdcEqual(updated.fee_usdc, fee)) throw new ExchangeBooksError("Fee label was not the 10%");
  return { job: updated, transfer };
}

async function settleRefund(
  db: ExchangeQuery,
  job: ExchangeJob,
): Promise<{ job: ExchangeJob; transfer: SimulatedOutgoing }> {
  if (!job.payer_address) throw new ExchangeBooksError("Refund needs the payer address");
  const full = fullAmountUsdc(job.amount_usdc);
  const transfer = oneOutgoing({
    jobId: job.id,
    to: job.payer_address,
    amountUsdc: full,
    kind: "refund_100",
  });
  const rows = await db.query<JobRow>(
    `update exchange_jobs
     set status = 'refunded', fee_usdc = 0, payout_signature = $2, payout_to = payer_address
     where id = $1 and status = 'held' and payout_signature is null
     returning ${JOB_COLUMNS}`,
    [job.id, transfer.signature],
  );
  const updated = rows[0] ? mapJob(rows[0]) : null;
  if (!updated) throw new ExchangeBooksError("Job could not be refunded");
  if (updated.fee_usdc !== "0") throw new ExchangeBooksError("A refund keeps no fee");
  if (updated.payout_to !== job.payer_address) throw new ExchangeBooksError("Refund must go back to the payer");
  if (updated.payout_signature !== transfer.signature) {
    throw new ExchangeBooksError("Refund must record the one return transfer");
  }
  return { job: updated, transfer };
}

export async function releaseHeldJob(
  db: ExchangeQuery,
  jobId: string,
  now: Date,
): Promise<{ job: ExchangeJob; transfer: SimulatedOutgoing | null }> {
  const job = await getJob(db, jobId);
  if (job.status !== "held") return { job, transfer: null };
  if (bothOkInTime(job)) return settleDone(db, job);
  if (now.getTime() >= Date.parse(job.deadline_at)) return settleRefund(db, job);
  return { job, transfer: null };
}

export async function recordHirerOk(
  db: ExchangeQuery,
  jobId: string,
  now: Date,
): Promise<{ job: ExchangeJob; transfer: SimulatedOutgoing | null }> {
  const job = await getJob(db, jobId);
  if (job.status !== "held") throw new ExchangeBooksError("Pay the full price before confirming the work");
  if (now.getTime() >= Date.parse(job.deadline_at)) return releaseHeldJob(db, jobId, now);
  if (!job.hirer_ok_at) {
    await db.query(
      `update exchange_jobs set hirer_ok_at = $2
       where id = $1 and status = 'held' and hirer_ok_at is null and payout_signature is null`,
      [jobId, now.toISOString()],
    );
  }
  return releaseHeldJob(db, jobId, now);
}

export async function recordWorkerOk(
  db: ExchangeQuery,
  jobId: string,
  workerAddress: string,
  now: Date,
): Promise<{ job: ExchangeJob; transfer: SimulatedOutgoing | null }> {
  const job = await getJob(db, jobId);
  if (job.status !== "held") throw new ExchangeBooksError("Pay the full price before confirming the work");
  if (now.getTime() >= Date.parse(job.deadline_at)) return releaseHeldJob(db, jobId, now);
  const worker = solanaAddress(workerAddress, "Worker address");
  if (!job.worker_ok_at) {
    await db.query(
      `update exchange_jobs set worker_ok_at = $2, payout_to = $3
       where id = $1 and status = 'held' and worker_ok_at is null and payout_signature is null`,
      [jobId, now.toISOString(), worker],
    );
  }
  return releaseHeldJob(db, jobId, now);
}

export async function releaseDueJobs(
  db: ExchangeQuery,
  now: Date,
): Promise<Array<{ job: ExchangeJob; transfer: SimulatedOutgoing | null }>> {
  const rows = await db.query<{ id: string }>(
    `select id from exchange_jobs where status = 'held' and deadline_at <= $1 order by created_at`,
    [now.toISOString()],
  );
  const settled: Array<{ job: ExchangeJob; transfer: SimulatedOutgoing | null }> = [];
  for (const row of rows) {
    settled.push(await releaseHeldJob(db, row.id, now));
  }
  return settled;
}

/** Held is the full price of held jobs. Earned exchange fees are fee_usdc on done jobs. */
export async function exchangeBalances(db: ExchangeQuery): Promise<ExchangeBalances> {
  const rows = await db.query<{ held_usdc: string; earned_fee_usdc: string }>(
    `select
       coalesce(sum(amount_usdc) filter (where status = 'held'), 0)::text as held_usdc,
       coalesce(sum(fee_usdc) filter (where status = 'done'), 0)::text as earned_fee_usdc
     from exchange_jobs`,
  );
  const row = rows[0];
  if (!row) return { held_usdc: 0, earned_fee_usdc: "0" };
  return {
    held_usdc: Number(row.held_usdc),
    earned_fee_usdc: normalizeUsdc(row.earned_fee_usdc),
  };
}

/** Tag cash still held apart from the 10% earned label. Same books, no new wallet. */
export function tagHeldApartFromEarned(balances: ExchangeBalances): SameWalletTags {
  const held = normalizeUsdc(balances.held_usdc);
  const earned = normalizeUsdc(balances.earned_fee_usdc);
  return {
    held: { tag: "held", usdc: held, profit: false },
    earned: { tag: "earned", usdc: earned },
    wallet_balance_usdc: sumUsdc([held, earned]),
    profit_usdc: earned,
  };
}
