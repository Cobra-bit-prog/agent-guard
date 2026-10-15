import { getSql } from "@/lib/db";
import { logPaymentAsk, type PaymentAskOptions } from "./log";

/** Wrap a paid route handler so a 402 or an unpaid checkout is logged. */
export function withPaymentAskLog(
  route: string,
  handler: (ctx: { request: Request }) => Response | Promise<Response>,
  options: PaymentAskOptions = {},
) {
  return async (ctx: { request: Request }): Promise<Response> => {
    const response = await handler(ctx);
    return logPaymentAsk(ctx.request, response, route, getSql, options);
  };
}
