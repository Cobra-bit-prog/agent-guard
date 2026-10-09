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
 * Agent directory table. Preview builds use the production DATABASE_URL, so
 * this file is skipped when VERCEL_ENV=preview. Production, local, and tests
 * apply it with no extra environment variable.
 */
export const AGENT_LISTINGS_MIGRATION = "0027_agent_listings.sql";

/**
 * Hire us orders. Preview builds use the production DATABASE_URL, so this
 * file is skipped when VERCEL_ENV=preview. Production, local, and tests
 * apply it with no extra environment variable.
 */
export const HIRE_ORDERS_MIGRATION = "0029_hire_orders.sql";

/**
 * Directory seed rows. Preview builds use the production DATABASE_URL, so this
 * file is skipped when VERCEL_ENV=preview. A preview build must not insert
 * listings into production. Production, local, and tests apply it with no
 * extra environment variable.
 */
export const DIRECTORY_SEED_MIGRATION = "0031_seed_agent_listings.sql";

/**
 * Featured directory slot. Preview builds use the production DATABASE_URL, so
 * this file is skipped when VERCEL_ENV=preview. Production, local, and tests
 * apply it with no extra environment variable. Admin approves it before merge.
 */
export const FEATURED_LISTINGS_MIGRATION = "0033_agent_listing_featured.sql";

/**
 * Directory seed wave 2. Preview builds use the production DATABASE_URL, so
 * this file is skipped when VERCEL_ENV=preview. A preview build must not insert
 * listings into production. Production, local, and tests apply it with no
 * extra environment variable.
 */
export const DIRECTORY_SEED_WAVE2_MIGRATION = "0034_seed_agent_listings_wave2.sql";

/**
 * listed_by on agent listings. Preview builds use the production DATABASE_URL,
 * so this file is skipped when VERCEL_ENV=preview. The backfill must not run
 * against production from a preview build. Production applies it with no extra
 * environment variable and no manual step: `npm run db:migrate` during
 * `npm run build`, then server boot if the build has not recorded it yet.
 * The listings POST succeeds before that column exists.
 */
export const LISTED_BY_MIGRATION = "0036_agent_listing_listed_by.sql";

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function exchangeJobsMigrationHeld(env = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function agentListingsMigrationHeld(env = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function hireOrdersMigrationHeld(env = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function directorySeedMigrationHeld(env = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function featuredListingsMigrationHeld(env = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function directorySeedWave2MigrationHeld(env = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function listedByMigrationHeld(env = process.env) {
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
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function agentListingsHoldNotice(env = process.env) {
  if (!agentListingsMigrationHeld(env)) return null;
  return `[directory] holding ${AGENT_LISTINGS_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function hireOrdersHoldNotice(env = process.env) {
  if (!hireOrdersMigrationHeld(env)) return null;
  return `[hire] holding ${HIRE_ORDERS_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function directorySeedHoldNotice(env = process.env) {
  if (!directorySeedMigrationHeld(env)) return null;
  return `[directory] holding ${DIRECTORY_SEED_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function featuredListingsHoldNotice(env = process.env) {
  if (!featuredListingsMigrationHeld(env)) return null;
  return `[directory] holding ${FEATURED_LISTINGS_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function directorySeedWave2HoldNotice(env = process.env) {
  if (!directorySeedWave2MigrationHeld(env)) return null;
  return `[directory] holding ${DIRECTORY_SEED_WAVE2_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function listedByHoldNotice(env = process.env) {
  if (!listedByMigrationHeld(env)) return null;
  return `[directory] holding ${LISTED_BY_MIGRATION}: VERCEL_ENV=preview uses the production DATABASE_URL, so this migration is not applied.`;
}

/**
 * @param {string} name
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
function migrationHeldOnPreview(name, env) {
  if (name === EXCHANGE_JOBS_MIGRATION) return exchangeJobsMigrationHeld(env);
  if (name === AGENT_LISTINGS_MIGRATION) return agentListingsMigrationHeld(env);
  if (name === HIRE_ORDERS_MIGRATION) return hireOrdersMigrationHeld(env);
  if (name === DIRECTORY_SEED_MIGRATION) return directorySeedMigrationHeld(env);
  if (name === FEATURED_LISTINGS_MIGRATION) return featuredListingsMigrationHeld(env);
  if (name === DIRECTORY_SEED_WAVE2_MIGRATION) return directorySeedWave2MigrationHeld(env);
  if (name === LISTED_BY_MIGRATION) return listedByMigrationHeld(env);
  return false;
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * `0025_exchange_jobs.sql`, `0027_agent_listings.sql`,
 * `0029_hire_orders.sql`, `0031_seed_agent_listings.sql`,
 * `0033_agent_listing_featured.sql`,
 * `0034_seed_agent_listings_wave2.sql`, and
 * `0036_agent_listing_listed_by.sql` are omitted on
 * preview builds only.
 * `0026_hide_exchange_smoke_jobs.sql`,
 * `0028_hide_directory_smoke_listing.sql`,
 * `0030_hide_junk_listing.sql`, and
 * `0035_hide_health_audit_smoke_listing.sql` still apply.
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
    .filter((entry) => !migrationHeldOnPreview(entry.name, env));
}
