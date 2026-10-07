-- Soft-hide directory listing "Health Audit Agent 9c7d145e" (Product Featured 402 smoke) (agent_22a353fc334ad7d05917a5a7).
-- Idempotent: only this listing, and only while hidden_at is still null.
-- Does not drop or alter schema. Soft-hide only; the row stays in agent_listings.

update agent_listings set hidden_at = now() where id = 'agent_22a353fc334ad7d05917a5a7' and hidden_at is null;
