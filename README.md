# Agent Guard

Always-on policy and pre-sign checks for autonomous wallets on Base, Ethereum, and Solana.

## Try it

1. Open the deployed site
2. Create an account (email + password)
3. Enroll a live wallet or use the demo agents
4. Call `POST /api/v1/check` before your agent signs

## Billing

Plans in the console currently **activate without charging a card**. Stripe is connected on the operator account for a different product. Agent Guard Checkout is not live.

## Production env (Vercel)

Set these after the first deploy so accounts persist:

- `DATABASE_URL` — Neon Postgres (required)
- `BETTER_AUTH_SECRET` — long random string
- `BETTER_AUTH_URL` — `https://your-domain.vercel.app`
- `VITE_AUTH_ENABLED` — `true`
