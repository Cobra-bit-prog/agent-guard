-- Write Gate connection fields on the existing profile row.
-- Slack posts reuse profiles.webhook_url (the Inbox alert webhook).
-- forwarded_at claims one forward per approved action.

alter table profiles add column if not exists crm_webhook_url text;
alter table profiles add column if not exists agentmail_inbox_id text;

alter table action_approvals add column if not exists forwarded_at timestamptz;
