-- Soft-hide junk directory listing name "x" (agent_7abea5e1a5e5f5e9e5164907).
-- Idempotent: only this listing, and only while hidden_at is still null.
-- Does not drop or alter schema. Soft-hide only; the row stays in agent_listings.

update agent_listings set hidden_at = now() where id = 'agent_7abea5e1a5e5f5e9e5164907' and hidden_at is null;
