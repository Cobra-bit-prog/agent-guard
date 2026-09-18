# Admin: one CDP Facilitator settle after Bazaar merge

Keys stay with Admin. Do **not** put `CDP_API_KEY_ID` or `CDP_API_KEY_SECRET` in this
repo, in Vercel preview env, or on an agent machine.

Meter 402s now advertise `resource` + `extensions.bazaar` so Coinbase Bazaar can
index Agent Meter. Indexing still requires **one successful settle through the
CDP Facilitator** after this change is on production. The live Meter settle path
(`x402.org` then PayAI) is a different catalog and does not list CDP Bazaar.

Payout wallets stay locked:

- Base USDC: `0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98`
- Solana USDC: `49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR`

Do not retarget `payTo`.

## After merge to production

1. Confirm the public door advertises Bazaar metadata:

```bash
curl -sS -X POST https://api.cdp.coinbase.com/platform/v2/x402/validate \
  -H 'Content-Type: application/json' \
  -d '{"resource":"https://agent-control.net/api/v1/meter/pass","method":"POST"}'
```

Expect `valid: true`, `bazaarExtension` non-null, and
`simulation.outcome: "accepted"`. No API key is required for validate.

2. On Admin's machine only, with CDP API keys in the local shell (never committed):

```bash
# local only — do not export these on Vercel or into an agent
export CDP_API_KEY_ID=…
export CDP_API_KEY_SECRET=…
```

3. Mint a live 402 (empty body invoices the `looks_20` pack; `{"sku":"look"}` is $0.10):

```bash
curl -sS -D - -o /tmp/meter-402.json \
  -X POST https://agent-control.net/api/v1/meter/pass \
  -H 'content-type: application/json' \
  -d '{}'
```

Decode the `PAYMENT-REQUIRED` header (base64 JSON). It includes `resource`,
`extensions.bazaar`, and Base CAIP-2 `eip155:8453` first.

4. Sign **Base USDC EIP-3009 exact** on Admin's machine to the locked
   `base_pay_to`. Echo the 402 `resource` object (and `extensions.bazaar`) into
   `paymentPayload`. Without `paymentPayload.resource`, Bazaar has nothing to
   attach.

5. Settle **once** against the CDP Facilitator, not `x402.org`:

```text
POST https://api.cdp.coinbase.com/platform/v2/x402/settle
```

Body shape: `{ x402Version: 2, paymentPayload, paymentRequirements }` from the
402. Authenticate with the CDP API key JWT. Docs:
https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/settle-payment
and https://docs.cdp.coinbase.com/x402/seller/get-discovered

6. Read `EXTENSION-RESPONSES` (base64 JSON). `bazaar.status` should be
   `success` or `processing`. `rejected` + `rejectedReason` means the echoed
   `info` failed schema validation or `resource` was omitted.

7. Retry `POST /api/v1/meter/pass` (or `meter_watch`) with `PAYMENT-SIGNATURE`
   so Meter mints `X-Agent-Pass`. Meter never takes keys.

Seller discovery guide: https://docs.cdp.coinbase.com/x402/seller/get-discovered
