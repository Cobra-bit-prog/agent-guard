import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, originFromRequest } from "@/lib/server/http";
import { payoutAddress } from "@/lib/solana-pay.server";
import { SOLANA_PAYOUT_ADDRESS } from "@/lib/pay-invoice";

/** Register (or reuse) a Helius enhanced webhook on the USDC receive wallet. */
export const Route = createFileRoute("/api/v1/billing/helius-setup")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const apiKey = process.env.HELIUS_API_KEY?.trim();
        const recipient = payoutAddress();
        if (!apiKey) {
          return json(
            {
              error: `Need HELIUS_API_KEY. SOLANA_PAYOUT_ADDRESS is ${SOLANA_PAYOUT_ADDRESS}. Pay UI still works by polling /api/v1/billing/watch.`,
            },
            503,
          );
        }
        const webhookURL =
          process.env.HELIUS_WEBHOOK_URL?.trim() ||
          `${originFromRequest(request)}/api/v1/billing/helius`;
        try {
          const existing = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`);
          const list: unknown = existing.ok ? await existing.json() : [];
          const found = Array.isArray(list)
            ? list.find((w) => {
                if (!w || typeof w !== "object") return false;
                return (w as { webhookURL?: string }).webhookURL === webhookURL;
              })
            : null;
          if (found && typeof found === "object") {
            const id = (found as { webhookID?: string }).webhookID;
            return json({ ok: true, webhookID: id, webhookURL, reused: true, recipient });
          }
          const created = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              webhookURL,
              accountAddresses: [recipient],
              webhookType: "enhanced",
              txnStatus: "finalized",
              transactionTypes: ["Any"],
            }),
          });
          const body: unknown = await created.json();
          if (!created.ok) {
            const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
            return json({ error: rec.error || body, webhookURL }, created.status);
          }
          const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
          return json({
            ok: true,
            webhookID: rec.webhookID || rec.webhookId,
            webhookURL,
            reused: false,
            recipient,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Helius setup failed.";
          return json({ error: message }, 502);
        }
      },
    },
  },
});
