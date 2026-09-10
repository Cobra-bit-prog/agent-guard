-- Meter invoice origin tracking. IP columns store HMAC-SHA256 only — never plaintext.
-- Hash key: INTERNAL_STATS_SECRET (reuse). Optional METER_IP_HASH_SECRET is local/dev
-- fallback only; do not set it on Vercel unless Admin/CoS adds it.
alter table if exists meter_invoices
  add column if not exists source text,
  add column if not exists user_agent text,
  add column if not exists cf_connecting_ip_hash text,
  add column if not exists x_forwarded_for_hash text,
  add column if not exists partner text;

create index if not exists meter_invoices_created_idx on meter_invoices (created_at desc);
