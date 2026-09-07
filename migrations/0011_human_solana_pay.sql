alter table pay_requests add column if not exists guest_email text;
alter table pay_requests add column if not exists source text not null default 'human';
create index if not exists pay_requests_guest_email_idx on pay_requests (guest_email);
alter table subscriptions add column if not exists trial_ending_sent_at timestamptz;
