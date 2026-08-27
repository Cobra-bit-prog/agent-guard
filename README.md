# Agent Control

Always-on policy and pre-sign checks for autonomous wallets on Base, Ethereum, and Solana.

The app already uses **Neon Postgres** when `DATABASE_URL` is set (local preview uses an in-memory fallback). Schema is applied on every Vercel build from `migrations/*.sql`.

## Try it

1. Open [https://agent-control.net](https://agent-control.net)
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
| `BETTER_AUTH_URL` | `https://agent-control.net` |
| `VITE_AUTH_ENABLED` | `true` |
| `SOLANA_PAYOUT_ADDRESS` | Operator Solana receive address (base58). Required for Solana Billing. |
| `SOLANA_RPC_URL` | Optional. Defaults to https://api.mainnet-beta.solana.com |
| `EVM_PAYOUT_ADDRESS` | Operator 0x receive address. Same account for Ethereum and Base. |
| `ETH_RPC_URL` | Optional. Defaults to a public Ethereum RPC. |
| `BASE_RPC_URL` | Optional. Defaults to https://mainnet.base.org |

6. **Redeploy** so `npm run build` runs migrations against Neon

Until `DATABASE_URL` is set, sign-ups live only in a throwaway store and disappear.

## Billing

Paid plans are **USDC** on Solana, Ethereum, or Base. Solana uses Solana Pay + Phantom (`SOLANA_PAYOUT_ADDRESS`). Ethereum and Base use native USDC transfer (`EVM_PAYOUT_ADDRESS`, same 0x account on both chains). Customers pay their own gas on ETH/Base. No card, no silent autopay: each month starts a new pay request in the console. After a payment confirms, we email a thank-you invoice once (Resend).
