-- Persist the pass token so Helius mint + later agent watch share the same credential.
alter table if exists meter_passes
  add column if not exists token text;
