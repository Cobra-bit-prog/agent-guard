-- Soft-hide exchange job "TEST placeholder - ignore (verifying POST example)" (job_84d532c9e5596725bf2040b7).
-- Idempotent: only this job, and only while hidden_at is still null.
-- Does not drop or alter schema. Soft-hide only; the row stays in exchange_jobs.

update exchange_jobs set hidden_at = now() where id = 'job_84d532c9e5596725bf2040b7' and hidden_at is null;
