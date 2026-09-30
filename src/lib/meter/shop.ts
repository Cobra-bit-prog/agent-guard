import { handleStampGate } from "./gate.ts";
import { DEFAULT_ALLOW_HOSTS } from "./sips.ts";
import type { MeterStore } from "./store.ts";
import { json } from "../server/http.ts";

/** Live seller on this domain. No ticket → no good. */
export const SHOP_PATH = "/api/v1/shop";

export async function handleShop(request: Request, store: MeterStore): Promise<Response> {
  const gated = await handleStampGate(request, store);
  if (gated.status !== 200) {
    const body = (await gated.json()) as Record<string, unknown>;
    const www = gated.headers.get("WWW-Authenticate");
    return json(
      {
        ...body,
        gate: "shop",
        question: "Take this ticket or we do not take your USDC.",
        item: "today_ok_hosts",
      },
      gated.status,
      www ? { "WWW-Authenticate": www } : undefined,
    );
  }
  const open = (await gated.json()) as Record<string, unknown>;
  return json({
    ok: true,
    gate: "shop",
    question: "Take this ticket or we do not take your USDC.",
    item: "today_ok_hosts",
    hosts: [...DEFAULT_ALLOW_HOSTS],
    stamp_id: open.stamp_id ?? null,
    note: "This shop will not deliver without a $0.05 ticket.",
  });
}
