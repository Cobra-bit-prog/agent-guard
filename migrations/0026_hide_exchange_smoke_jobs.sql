-- Oct 5 smoke posts being hidden for announce.
-- Idempotent: only these two listings, and only while hidden_at is still null.
-- Does not drop or alter schema. Soft-hide only; the rows stay in exchange_jobs.

update exchange_jobs
set hidden_at = now()
where hidden_at is null
  and id in (
    'job_5282bc3a7d7f0351c060fdd6',
    'job_d76e18644950cd189d8575dd'
  );
