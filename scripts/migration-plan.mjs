// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Agent Exchange v1 is a test copy. This file must not run against the
 * production Neon database.
 *
 * Vercel preview builds set DATABASE_URL to production and `npm run build`
 * applies pending files in migrations/. The server boot path in src/lib/db.ts
 * applies the same list again. Both call `pendingMigrations`.
 *
 * Held when VERCEL_ENV is preview (even if the opt-in flag is also set), and
 * held unless EXCHANGE_JOBS_APPLY_MIGRATION=1. Do not set that flag on Vercel.
 * Tests apply the SQL to their own throwaway database.
 */
export const EXCHANGE_JOBS_MIGRATION = "0025_exchange_jobs.sql";

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function exchangeJobsMigrationHeld(env = process.env) {
  if (env.VERCEL_ENV === "preview") return true;
  return env.EXCHANGE_JOBS_APPLY_MIGRATION !== "1";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function exchangeJobsHoldNotice(env = process.env) {
  if (!exchangeJobsMigrationHeld(env)) return null;
  if (env.VERCEL_ENV === "preview") {
    return `[exchange] holding ${EXCHANGE_JOBS_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
  }
  return `[exchange] holding ${EXCHANGE_JOBS_MIGRATION}: set EXCHANGE_JOBS_APPLY_MIGRATION=1 only against a throwaway database. Preview never applies it.`;
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @param {Record<string, string | undefined>} [env]
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied, env = process.env) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name))
    .filter((entry) => entry.name !== EXCHANGE_JOBS_MIGRATION || !exchangeJobsMigrationHeld(env));
}
