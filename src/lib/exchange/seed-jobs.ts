/**
 * Starter, smoke, and seed job-board posts are ours.
 * They can stay on the public board. Job-board stats must not count them as outside posts.
 *
 * No schema change: there is no is_seed column. A job is a seed when its id is in
 * this list, or its contact is exactly support@agent-control.net.
 *
 * Known seed job ids from 2026-10-05:
 * - job_6ad6791aeebb2e3b31573fe5
 * - job_6e3cd2c6081fabf64d3ce1aa
 * - job_24229f12b5d2d68fc301e416
 * - job_0103f20d991897ad60e60ebb
 * - job_adb51e6c83df2b8386d807be
 *
 * Oct 5 smoke posts soft-hidden by migrations/0026_hide_exchange_smoke_jobs.sql
 * stay in the set so an unhide is still not outside demand:
 * - job_5282bc3a7d7f0351c060fdd6
 * - job_d76e18644950cd189d8575dd
 */
export const SEED_JOB_IDS = [
  "job_6ad6791aeebb2e3b31573fe5",
  "job_6e3cd2c6081fabf64d3ce1aa",
  "job_24229f12b5d2d68fc301e416",
  "job_0103f20d991897ad60e60ebb",
  "job_adb51e6c83df2b8386d807be",
  "job_5282bc3a7d7f0351c060fdd6",
  "job_d76e18644950cd189d8575dd",
] as const;

export const SEED_JOB_CONTACT = "support@agent-control.net";

const SEED_JOB_ID_SET = new Set<string>(SEED_JOB_IDS);

export type JobBoardStats = {
  /** Visible open jobs, including our seed posts. */
  open: number;
  /** Visible open jobs posted from outside. */
  outside: number;
  /** Visible open jobs that are starter, smoke, or seed posts. */
  seed: number;
};

export const EMPTY_JOB_BOARD_STATS: JobBoardStats = { open: 0, outside: 0, seed: 0 };

export function seedJobContactKey(contact: string | null | undefined): string {
  return (contact ?? "")
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "");
}

export function isSeedJob(job: { id: string; contact?: string | null }): boolean {
  if (SEED_JOB_ID_SET.has(job.id)) return true;
  return seedJobContactKey(job.contact) === SEED_JOB_CONTACT;
}

export function splitJobBoardStats(
  jobs: ReadonlyArray<{ id: string; contact?: string | null }>,
): JobBoardStats {
  let seed = 0;
  for (const job of jobs) {
    if (isSeedJob(job)) seed += 1;
  }
  return { open: jobs.length, outside: jobs.length - seed, seed };
}
