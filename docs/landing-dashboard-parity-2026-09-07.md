# Landing ↔ dashboard parity

Snapshot of production landing claims vs human console + public APIs. **No product behavior changed.**

- Date: 2026-09-07
- Live host: https://agent-control.net
- Code: `src/routes/index.tsx` + `src/components/marketing/*`, console `src/routes/_app/*`, HTTP `src/routes/api/`
- Probe rule: public GETs and MCP `initialize` / `get_pricing` only. No agent keys, no signup, no trial mint, no secrets.

Status: **Live** (real API + human UI) · **Demo-only** (client viz) · **Partial** (exists, claim overreaches) · **Copy-only** (no product surface)

| Landing claim | Backend API | Console UI | Status |
| --- | --- | --- | --- |
| Hero **Start free trial** / header **Try free** → `/signup` | `POST /api/auth/*` (Better Auth email signup). Trial row starts in `ensureProfile` (`FREE_TRIAL_HOURS=24`). `/signup` client-navs to `/login?mode=signup`. Live: `/signup` 200, `/login?mode=signup` 200. | `/login` (sky theme) → `/verify-email` → `/dashboard` | **Live** |
| Hero preview **Review** + spend chart | None (static HTML) | Real spend/alerts live on `/dashboard` after auth | **Demo-only** (CTA → signup) |
| Verdict `#week` — paste wallet / **Open an example** | None. Submit ignores the address and always shows the same four rows. | Real enroll + on-chain sync is **Add agent** on `/agents` (`createAgent` / `getOnchain`) | **Demo-only** |
| Product tabs Dashboard / Agent Audit / Approval Inbox | None for the landing viz (hardcoded rows). Warning-alerts toggle says it does not send mail. Download / Allow / Block links → `/signup`. | `/dashboard`, `/audit`, `/inbox` | **Demo-only** preview; product **Live** after signup |
| Catch `#catch` **Go** / Allow once / Block | None. Local React state. Copy: “Example only. No real money moves.” | Real hold decide is `/inbox` (`decideApproval`) | **Demo-only** |
| How it works 01 Enroll a wallet | Session `createAgent` (not public REST). Live wallets sync native balance. | `/agents` + `/agents/$id` | **Live** |
| How it works 02 Set policy (daily / dest / hourly) | Session `savePolicy` | `/policies` list; edit on `/agents/$id` | **Live** |
| How it works 03 Connect your agent (API key, check before send) | `POST /api/v1/check` (live GET usage 200; POST without key **401**). MCP `check_transfer` at `POST /api/v1/mcp`. Key issued/rotated on agent page. | `/agents/$id` Pre-sign key card. No extra “connectors” screen. | **Live** (docs + agent page; connectors are docs/MCP) |
| How it works 04 Watch + pause | Session `getDashboard`, `scanAgents`, `updateAgent({ is_paused })` | `/dashboard` (pause, sync, feed) | **Live** |
| Pricing 1-day / no card / no KYC / $29 $49 $149 | `GET /api/v1/storefront/pricing` **200** (trial 24h, plans match `PLANS`). MCP `get_pricing` **200** without a key. Trial starts on human signup, not on storefront POST. | `/billing` plan cards + trial banner | **Live** |
| Pricing **Start free trial** | Same as hero signup | `/login?mode=signup` | **Live** |
| Pricing **Pay USDC** / **Pay on-chain** → `/billing` | Session `createPayRequest` + on-chain watcher. Agent alias `POST /api/v1/billing/checkout` (GET usage 200; POST no key **401**). Needs `SOLANA_PAYOUT_ADDRESS` / `EVM_PAYOUT_ADDRESS`. Not probed without a session. | `/billing`, `/billing/pay` (QR / amount+address, USDC/SOL/ETH) | **Live** after auth. Unauth `/billing` SPA-gates to login. Pay config is env-gated. |
| Pro blurb “Priority alerts” | Same `alerts` + email pipeline for every plan | `/alerts` | **Partial** — no priority queue |
| Team blurb “Multiple seats” | No seats/members tables | Single-user `/settings` profile | **Partial** — copy only; higher agent/history limits are real |
| Gate `#sellers` “leash” badge / take money only from leashed agents | None. Copy + blockquote only. | None | **Copy-only** |
| FAQ: no custody / keys stay with you | Check is advisory `POST /api/v1/check`; app never holds keys | Console copy + pause is operator-side | **Live** (honest: skip-check cannot be stopped) |
| FAQ: confirm email before dashboard | Better Auth verification + Resend (`RESEND_API_KEY`) | `/verify-email` wait + resend | **Live** (mail depends on Resend env) |
| FAQ: Solana / Ethereum / Base; live vs demo wallets | `getOnchain` + `is_demo` | `/agents` Live/Demo badges | **Live** |
| FAQ: pre-sign hook `POST /api/v1/check`; HOLD + `poll_url`; pause/denylist hard block | `POST /api/v1/check`, `GET /api/v1/approvals/$id` (no key **401**), MCP `get_approval`. Hold TTL 10 min (`HOLD_TTL_MS`). | `/inbox` | **Live** |
| FAQ: Approval Inbox allow once / always / block | Session `decideApproval`; “always” writes allowlist. No agent/storefront decide path. | `/inbox` | **Live** |
| FAQ: Agent Audit on-demand Excel/PDF/CSV; not auto-emailed | Session `generateAuditReport` / `downloadAuditReport` (xlsx/pdf/csv builders) | `/audit` | **Live** |
| FAQ: email alerts + Slack hold ping; console `/alerts` | `notifyWarningAlert` + Slack incoming webhook POST; Settings `email_alerts` default on, `webhook_url` | `/settings` Email alerts + Slack URL; `/alerts` list | **Live** (Slack needs a saved https webhook; Telegram UI exists but is not a landing claim) |
| FAQ: on-chain pay, no KYC/card, unique amount, no exchange memo | `pay_requests` unique amount + watcher | `/billing/pay` | **Live** (same env gate as Pay CTAs) |
| FAQ: not insurance | N/A (positioning) | N/A | **Live** (copy matches product) |
| FAQ: contact `support@agent-control.net` | None (mailto only) | Header/footer Contact | **Live** as mailto. No contact form. |
| Connectors / adapters / storefront (nav Docs, not a landing module) | MCP Streamable HTTP live: `initialize` **200** + `Mcp-Session-Id`; SSE when `Accept` includes `text/event-stream`. Adapters: repo `src/adapters` (copy into the agent). Storefront: pricing **200**; trial/attach GET usage **200**; trial POST `{}` **400** (no mint). | Human: `/docs#connectors`, `#adapters`, `#agent-storefront`. No console connectors page. | **Live** for MCP/pricing. Adapters are source helpers, not a hosted marketplace. Storefront trial returns a signup invite JSON; does not create the human account. |
| Partners nav `/partners` | First-touch `?partner=` cookie + `user_partner_source` (no overwrite) | `/partners` + signup links | **Live** (attribution only; not a partner portal) |
| Contact nav | `mailto:support@agent-control.net` | Same | **Live** (mailto) |

## Color alignment

Landing and marketing chrome (`.sky` on `/`, `/docs`, `/partners`, `/login`) use **bg `#eef3f8`**, **navy `#1e3a5f`**, **coral `#e85d4c`** as primary. Confirmed in `src/styles.css` and production `/assets/styles-*.css`.

The authenticated console does **not** use that sky chrome. Default `@theme` is dark **bg `#07090f`**, **primary `#3b82f6`**. Navy/coral tokens exist globally but sidebar/main stay dark (`AppShell` `bg-bg`). Comment in CSS: marketing theme is scoped so the console stays dark.

**Not aligned** for dashboard chrome vs landing. Aligned for marketing + signup/login only.

## Probe log (public, 2026-09-07)

| Call | Result |
| --- | --- |
| `GET /` | 200, SSR includes `#week` `#catch` `#sellers` `#pricing` |
| `GET /api/v1/storefront/pricing` | 200 JSON plans/trial |
| `GET /api/v1/check` | 200 usage |
| `POST /api/v1/check` (no key) | 401 Missing API key |
| `GET /api/v1/mcp` | 200 discovery |
| `POST /api/v1/mcp` initialize | 200 + `mcp-session-id` |
| `POST /api/v1/mcp` `tools/call` `get_pricing` (no key) | 200 |
| `GET /api/v1/storefront/status` (no key) | 401 |
| `POST /api/v1/billing/checkout` (no key) | 401 |
| `POST /api/v1/storefront/trial` `{}` | 400 (no account created) |

## Gaps (short)

1. `#week` and `#catch` are client demos; they do not call check/inbox.
2. `#sellers` leash badge has no API or console widget.
3. Team seats and Pro priority alerts are plan blurbs, not separate features.
4. Landing Pay CTAs hit `/billing`, which is session-gated (expected, but not a public checkout).
5. Unused demo components `landing-console.tsx` / `landing-demo-dashboard.tsx` are not on the current landing.
