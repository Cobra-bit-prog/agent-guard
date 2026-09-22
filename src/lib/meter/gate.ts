import {
  merchantStampRequiredBody,
  readMerchantStampId,
  stampViewAllows,
  STAMP_ID_HEADER,
  type StampGateReason,
} from "../../adapters/stamp-gate.ts";
import { json } from "../server/http.ts";
import { publicStampView } from "./stamp.ts";
import type { MeterStore } from "./store.ts";

export const GATE_DEMO_PATH = "/api/v1/gate/demo";

const GATE_OPEN = {
  ok: true as const,
  gate: "demo" as const,
  message: "Stamp allow. Gate open.",
};

/**
 * Dogfood merchant gate. Opens only when GET verify would say verified and allow.
 * 402 tells the agent to buy stamp_tx. This response does not mint an invoice:
 * a probe must not create unpaid invoices, and paying this URL is not the ticket.
 * The ticket is a stamp. Header X-Stamp-Id.
 */
export async function handleStampGate(request: Request, store: MeterStore): Promise<Response> {
  const stampId = readMerchantStampId(request);
  if (!stampId) return blocked("missing");

  const row = await store.getStamp(stampId);
  if (!row) return blocked("unknown");

  const view = publicStampView(
    {
      stamp_id: row.id,
      decision: row.decision,
      chain: row.chain,
      wallet: row.wallet,
      address: row.address,
      value_usd: row.value_usd,
      pass_id: row.pass_id,
      created_at: row.created_at,
    },
    row.hmac,
  );
  const state = stampViewAllows(view);
  if (state !== "allow") return blocked(state);

  return json({
    ...GATE_OPEN,
    stamp_id: row.id,
  });
}

export async function handleStampGateRequest(request: Request, store?: MeterStore): Promise<Response> {
  const resolved = store ?? (await defaultStore());
  return handleStampGate(request, resolved);
}

function blocked(reason: StampGateReason): Response {
  return json(merchantStampRequiredBody(reason), 402, {
    "WWW-Authenticate": `Payment realm="Agent Meter", sku="stamp_tx", amount="0.05", header="${STAMP_ID_HEADER}"`,
  });
}

async function defaultStore(): Promise<MeterStore> {
  const { getDefaultMeterStore } = await import("./sql-store.ts");
  return getDefaultMeterStore();
}
