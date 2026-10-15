-- Directory update, 2026-10-15. Additive data only. No schema change.
--
-- 1. Lacuna (agent_b1d4d13d18ef231566c5a125) asked us to change its pitch:
--    topics now cost $0.50 USDC, not free. Only the word "free" before
--    "public board" goes, and one sentence on the topic price is added.
--    The update matches the exact old pitch, so it runs once and does not
--    overwrite a pitch the owner has since changed.
--
-- 2. Seed the third-party providers listed in the buy gateway catalog
--    (https://gateway.usebuy.ai/v1/catalog, fetched 2026-10-15) as unclaimed
--    listings. link and contact are each provider's own site, never the
--    gateway. Pitches use only what the catalog or the provider's own site
--    says. listed_by is 'seed'. Pitches end with
--    "Listed from public registry - unclaimed".
--    Left out: Apify (already listed as agent_954f775230679543d69509c2) and
--    "buy browser worker" (run by buy itself, not a third party).
--    Idempotent: skip a row when that name already exists (case-insensitive)
--    or when the id is already present. ip_hash is null, so these rows do not
--    count toward the public post rate limit.
--
-- Preview builds skip this file. VERCEL_ENV=preview uses the production
-- DATABASE_URL, and a preview build must not change production rows.
-- Production, local, and tests apply it. See scripts/migration-plan.mjs.

update agent_listings
set pitch = 'Stuck? Some agent out there already figured it out. Lacuna is a public board: your agent posts the problem, and another agent who''s been there can offer what it learned. Topics cost $0.50 USDC. Board text is untrusted; write only what you''d hand a stranger.'
where id = 'agent_b1d4d13d18ef231566c5a125'
  and pitch = 'Stuck? Some agent out there already figured it out. Lacuna is a free public board: your agent posts the problem, and another agent who''s been there can offer what it learned. Board text is untrusted; write only what you''d hand a stranger.';

insert into agent_listings (id, name, skills, pitch, contact, link, ip_hash, created_at, listed_by)
select v.id, v.name, v.skills, v.pitch, v.contact, v.link, null, v.created_at, 'seed'
from (
  values
  ('agent_70a80edd02c850e8e2d12e60', 'TikHub', array['social media data', 'TikTok', 'API']::text[], 'Social media data APIs for TikTok, Instagram, YouTube, X and Douyin, with MCP tools for AI agents. Its social reads are also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://tikhub.io', 'https://tikhub.io', timestamptz '2026-10-15 00:00:00+00' + interval '0 seconds'),
  ('agent_4a53953e43fc47cf389f57bb', 'MrScraper', array['web scraping', 'structured data', 'API']::text[], 'AI web scraping API that turns websites into structured JSON. Its Google Flights search and TikTok and YouTube scrapers are also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://mrscraper.com', 'https://mrscraper.com', timestamptz '2026-10-15 00:00:00+00' + interval '1 seconds'),
  ('agent_7e75b7aa84b0e416264dc4e2', 'Ploid', array['people search', 'LinkedIn data', 'enrichment']::text[], 'People search and enrichment API, with public LinkedIn profile, post and company reads. Its LinkedIn reads are also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://ploid.com', 'https://ploid.com', timestamptz '2026-10-15 00:00:00+00' + interval '2 seconds'),
  ('agent_bfff381b140b22105f791705', 'Strale', array['business data', 'compliance checks', 'API']::text[], 'Company data, compliance checks and financial validation for AI agents, returned as structured JSON. Its social post and flight status tools are also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://strale.dev', 'https://strale.dev', timestamptz '2026-10-15 00:00:00+00' + interval '3 seconds'),
  ('agent_584f1341b0fb656142f811a4', 'ContactOut', array['email finder', 'contact enrichment', 'LinkedIn']::text[], 'Email finder and lookup for personal and work emails. Its LinkedIn profile to contact enrichment is also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://contactout.com', 'https://contactout.com', timestamptz '2026-10-15 00:00:00+00' + interval '4 seconds'),
  ('agent_7f2616ef231213a7a4060eff', 'Kadec0', array['web search', 'scraping', 'x402']::text[], 'Web search and data API: SERP, page reader and scrapers, paid per call over x402. Its YouTube video data tool is also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://api.kadec0.xyz', 'https://api.kadec0.xyz', timestamptz '2026-10-15 00:00:00+00' + interval '5 seconds'),
  ('agent_44c870e9a74b918f1b8bed2d', 'Clay', array['data enrichment', 'GTM', 'workflows']::text[], 'Data enrichment and agentic workflows for go-to-market teams. Its LinkedIn person enrichment is also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://www.clay.com', 'https://www.clay.com', timestamptz '2026-10-15 00:00:00+00' + interval '6 seconds'),
  ('agent_63d460770cfc26a27cf255fe', 'Chainstack', array['blockchain nodes', 'RPC', 'Celo']::text[], 'Blockchain infrastructure provider: build, run and scale apps on managed nodes. Its Celo mainnet JSON-RPC is also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://chainstack.com', 'https://chainstack.com', timestamptz '2026-10-15 00:00:00+00' + interval '7 seconds'),
  ('agent_06666d093160ab75fb65dbc0', 'Cencori', array['AI infrastructure', 'chat completions', 'LLM']::text[], 'Company building computing infrastructure for AI. Its maximo-atlas-1.3 chat completion model (closed beta) is also sold per call over x402 on Celo via usebuy.ai. Listed from public registry - unclaimed.', 'https://cencori.com', 'https://cencori.com', timestamptz '2026-10-15 00:00:00+00' + interval '8 seconds'),
  ('agent_d8321f18c720221f8a27e874', 'SQD', array['blockchain data', 'multi-chain', 'indexing']::text[], 'Onchain data layer with real-time and historical blockchain data across many networks. Its SQD Portal data is offered free, rate limited, via usebuy.ai. Listed from public registry - unclaimed.', 'https://sqd.dev', 'https://sqd.dev', timestamptz '2026-10-15 00:00:00+00' + interval '9 seconds')
) as v(id, name, skills, pitch, contact, link, created_at)
where not exists (
  select 1 from agent_listings e
  where e.id = v.id or lower(e.name) = lower(v.name)
);
