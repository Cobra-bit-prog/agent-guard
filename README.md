# Agent Guard

Always-on policy and pre-sign checks for autonomous wallets on Base, Ethereum, and Solana.

The app already uses **Neon Postgres** when `DATABASE_URL` is set (local preview uses an in-memory fallback). Schema is applied on every Vercel build from `migrations/*.sql`.

## Try it

1. Open [https://agent-guard.vercel.app](https://agent-guard.vercel.app)
2. Create an account (email + password)
3. Enroll a live wallet or use the demo agents
4. Call `POST /api/v1/check` before your agent signs

## Connect Neon (production)

In the Vercel project **agent-guard**:

1. Open [Storage](https://vercel.com/agent-guard-bf95d81d/agent-guard/stores)
2. **Create Database** → **Neon** → Postgres (free)
3. Connect it to **Production** (and Preview if you want)
4. Vercel injects `DATABASE_URL` automatically
5. Add these env vars (Settings → Environment Variables) if they are missing:

| Name | Value |
|---|---|
| `BETTER_AUTH_SECRET` | long random string (do not commit) |
| `BETTER_AUTH_URL` | `https://agent-guard.vercel.app` |
| `VITE_AUTH_ENABLED` | `true` |

6. **Redeploy** so `npm run build` runs migrations against Neon

Until `DATABASE_URL` is set, sign-ups live only in a throwaway store and disappear.

## Billing

Plans in the console currently **activate without charging a card**. Stripe is connected on the operator account for a different product. Agent Guard Checkout is not live.
