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
 * Job board table. Preview builds use the production DATABASE_URL, so this
 * file is skipped when VERCEL_ENV=preview. Production, local, and tests apply
 * it with no extra environment variable.
 */
export const EXCHANGE_JOBS_MIGRATION = "0025_exchange_jobs.sql";

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function exchangeJobsMigrationHeld(env = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function exchangeJobsHoldNotice(env = process.env) {
  if (!exchangeJobsMigrationHeld(env)) return null;
  return `[exchange] holding ${EXCHANGE_JOBS_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * `0025_exchange_jobs.sql` is omitted on preview builds only.
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
