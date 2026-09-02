-- First-touch partner attribution (`?partner=` on signup/login landing).
-- Separate from Better Auth "user" so this stays additive and reversible.
create table if not exists user_partner_source (
  user_id text primary key,
  partner_source text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_partner_source_slug_idx
  on user_partner_source (partner_source);
