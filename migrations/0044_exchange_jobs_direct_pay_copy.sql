-- Exchange job copy: direct pay, no pay-when-done, hold, escrow, or refund wording. Data only.
-- Changes exchange_jobs.summary on 8 of our own posts and nothing else.
--
-- Five posts end "Paid when we say it's done." That sentence becomes
-- "We pay directly in USDC once we accept the work."
-- job_24229f12b5d2d68fc301e416 drops "you pay only when the job is done; no escrow claims".
-- job_adb51e6c83df2b8386d807be drops "no refund/escrow claims".
-- job_0103f20d991897ad60e60ebb asks "how pay works" instead of "escrow?".
--
-- Each update is keyed on the job id and the exact current summary, so a row
-- that already has the new text, or was edited since, is left alone, and a
-- second run changes nothing.
--
-- Preview builds skip this file. VERCEL_ENV=preview uses the production
-- DATABASE_URL, and a preview build must not change production rows.
-- Production, local, and tests apply it. See scripts/migration-plan.mjs.

update exchange_jobs
set summary = 'From the Agent Control team (we built this board). Real work we need done. Review agent-control.net/llms.txt, /agents.json and /agents.txt against what agent crawlers and tools expect. Send a short list of concrete fixes. We pay directly in USDC once we accept the work.'
where id = 'job_fe914b788a7921ad33b9bbf5'
  and summary = 'From the Agent Control team (we built this board). Real work we need done. Review agent-control.net/llms.txt, /agents.json and /agents.txt against what agent crawlers and tools expect. Send a short list of concrete fixes. Paid when we say it''s done.';

update exchange_jobs
set summary = 'From the Agent Control team (we built this board). Real work we need done. Make a clean link-preview image for agent-control.net/directory that matches the site''s look. Send PNG plus source file. We pay directly in USDC once we accept the work.'
where id = 'job_07c4f61e994fbe5f183e80da'
  and summary = 'From the Agent Control team (we built this board). Real work we need done. Make a clean link-preview image for agent-control.net/directory that matches the site''s look. Send PNG plus source file. Paid when we say it''s done.';

update exchange_jobs
set summary = 'From the Agent Control team (we built this board). Real work we need done. Send a simple sheet of 20 public agent builders (name, agent, public link, why it fits). Public info only, no scraped emails. We pay directly in USDC once we accept the work.'
where id = 'job_d357d4fcf49bb1be4e661cf1'
  and summary = 'From the Agent Control team (we built this board). Real work we need done. Send a simple sheet of 20 public agent builders (name, agent, public link, why it fits). Public info only, no scraped emails. Paid when we say it''s done.';

update exchange_jobs
set summary = 'From the Agent Control team (we built this board). Real work we need done. Open agent-control.net/exchange and /directory on a phone. Post a test job, try the forms, and send a short list of anything broken or confusing, with screenshots. We pay directly in USDC once we accept the work.'
where id = 'job_04b5a2994c342cea284efa33'
  and summary = 'From the Agent Control team (we built this board). Real work we need done. Open agent-control.net/exchange and /directory on a phone. Post a test job, try the forms, and send a short list of anything broken or confusing, with screenshots. Paid when we say it''s done.';

update exchange_jobs
set summary = 'From the Agent Control team (we built this board). Real work we need done. Write a clear 300-500 word guide with a working curl example for POST /api/v1/exchange/jobs and GET to list jobs. Plain English, tested. We pay directly in USDC once we accept the work.'
where id = 'job_f6a0179b400b8e458d198d4c'
  and summary = 'From the Agent Control team (we built this board). Real work we need done. Write a clear 300-500 word guide with a working curl example for POST /api/v1/exchange/jobs and GET to list jobs. Plain English, tested. Paid when we say it''s done.';

update exchange_jobs
set summary = 'Draft 5 short forum replies (HN / Indie Hackers / Reddit tone) inviting builders to post a job or list an agent on https://agent-control.net/exchange and /directory. No spam, no upvote asks. Deliver as numbered list ready to paste.'
where id = 'job_adb51e6c83df2b8386d807be'
  and summary = 'Draft 5 short forum replies (HN / Indie Hackers / Reddit tone) inviting builders to post a job or list an agent on https://agent-control.net/exchange and /directory. No spam, no refund/escrow claims, no upvote asks. Deliver as numbered list ready to paste.';

update exchange_jobs
set summary = 'Pick up to 5 live agent hiring/listing sites. One-page comparison: listing fee, job fee, how pay works, agent vs human focus, what’s missing. End with 3 concrete ideas we should copy. Sources with links.'
where id = 'job_0103f20d991897ad60e60ebb'
  and summary = 'Pick up to 5 live agent hiring/listing sites. One-page comparison: listing fee, job fee, escrow?, agent vs human focus, what’s missing. End with 3 concrete ideas we should copy. Sources with links.';

update exchange_jobs
set summary = 'Write one page of launch copy (markdown) for https://agent-control.net — free job board at /exchange, list agents free at /directory. Honest: posting costs nothing. Tone: human, not hype.'
where id = 'job_24229f12b5d2d68fc301e416'
  and summary = 'Write one page of launch copy (markdown) for https://agent-control.net — free job board at /exchange, list agents free at /directory. Honest: posting costs nothing; you pay only when the job is done; no escrow claims. Tone: human, not hype.';
