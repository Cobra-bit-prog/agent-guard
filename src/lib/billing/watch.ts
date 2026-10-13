/**
 * /api/v1/billing/watch logic with injectable deps so tests can mock the
 * DB and the on-chain lookup.
 *
 * Row found -> watch it. No row -> on-chain lookup only when `reference`
 * is a real Solana pubkey (base58, decodes to 32 bytes). Junk or missing
 * reference (e.g. inv_TEST) -> 404, never a phantom "pending".
 */
import { validateMeterAddress } from "../meter/address.ts";
import { payPlanQuote } from "../shop-shield.ts";

export function isSolanaReference(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (s.length < 32 || s.length > 44) return false;
  return validateMeterAddress("solana", s).ok;
}

type Row = { asset?: unknown; chain?: unknown };
type Match = { kind: string; signature?: string | null };

export interface WatchDeps<R extends Row> {
  json: (data: unknown, status?: number) => Response;
  getInvoiceRow: (key: string) => Promise<R | null | undefined>;
  isHumanUsdcInvoice: (row: R) => boolean;
  watchUsdcInvoice: (row: R) => Promise<R>;
  invoiceView: (row: R, origin: string) => unknown;
  origin: (request: Request) => string;
  findMatchingUsdcPayment: (opts: { reference: string; recipient: string; amountUsdc: number }) => Promise<Match>;
  payoutAddress: () => string;
}

export function createWatchHandler<R extends Row>(deps: WatchDeps<R>) {
  const { json } = deps;
  return async function handleWatch({ request }: { request: Request }): Promise<Response> {
    const url = new URL(request.url);
    let body: Record<string, unknown> = {};
    if (request.method === "POST") {
      try {
        const parsed: unknown = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        body = {};
      }
    }
    const id = String(url.searchParams.get("id") || body.id || "").trim();
    const reference = String(url.searchParams.get("reference") || body.reference || "").trim();
    const key = id || reference;
    if (!key) return json({ error: "Provide id or reference." }, 400);

    let row = await deps.getInvoiceRow(key);
    if (row && !deps.isHumanUsdcInvoice(row)) {
      return json({ error: "Invoice is not Solana USDC.", asset: row.asset, chain: row.chain }, 409);
    }
    if (!row) {
      if (!isSolanaReference(reference)) return json({ error: "Invoice not found." }, 404);
      const quote = payPlanQuote(url.searchParams.get("plan") || body.plan);
      try {
        const match = await deps.findMatchingUsdcPayment({
          reference,
          recipient: deps.payoutAddress(),
          amountUsdc: quote.price,
        });
        return json({
          status: match.kind === "paid" ? "paid" : "pending",
          signature: match.kind === "paid" || match.kind === "underpaid" ? match.signature : null,
          recipient: deps.payoutAddress(),
        });
      } catch (err) {
        console.error("[billing] watch rpc failed", err);
        return json({ status: "pending", signature: null, recipient: deps.payoutAddress() });
      }
    }
    try {
      row = await deps.watchUsdcInvoice(row);
    } catch (err) {
      console.error("[billing] watch failed", err);
    }
    return json(deps.invoiceView(row, deps.origin(request)));
  };
}
