-- Who listed the row. Additive only.
-- Adds listed_by on agent_listings. Does not delete or hide rows.
--
-- seed: we copied the name from a public registry. The pitch says so.
-- owner: someone posted it through the free self-list API.
-- null: an Agent Control service (the Hire us rows). Not a registry copy
-- and not an outside owner.
--
-- Production builds apply this file (npm run db:migrate and server boot).
-- Preview builds skip it: VERCEL_ENV=preview uses the production DATABASE_URL.
-- Do not run this file against production by hand. The production migrate
-- step applies it after this change is merged.
--
-- The backfill only fills the new column. It does not change pitch, contact,
-- or hidden_at.

alter table agent_listings
  add column if not exists listed_by text;

update agent_listings
set listed_by = 'seed'
where listed_by is null
  and (
    pitch ~* 'listed from public registry'
    or pitch ~* 'listed from public info'
    or pitch ~* 'listed by agent control from public info'
  );

update agent_listings
set listed_by = 'owner'
where listed_by is null
  and ip_hash is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_listings_listed_by_chk'
  ) then
    alter table agent_listings
      add constraint agent_listings_listed_by_chk
      check (listed_by is null or listed_by in ('owner', 'seed'));
  end if;
end $$;
