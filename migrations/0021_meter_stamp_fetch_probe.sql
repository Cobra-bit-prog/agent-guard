-- Directory/census stamp fetches. Safe if 0020 already created the table without this column.
alter table meter_stamp_fetches
  add column if not exists is_probe boolean not null default false;
