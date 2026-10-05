-- Hide Admin Oct 5 migrate probe from public agent directory.
-- Idempotent: only this listing, and only while hidden_at is still null.
-- Does not drop or alter schema. Soft-hide only; the row stays in agent_listings.

update agent_listings
set hidden_at = now()
where hidden_at is null
  and id = 'agent_d53dcc06145d070678e26eac';
