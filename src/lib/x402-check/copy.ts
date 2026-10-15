/** Customer copy for the x402 listing check. Price matches the existing $19 direct USDC payment. */

export const X402_CHECK_SKU = "x402_report_7d" as const;
export const X402_CHECK_PRICE_USD = 19;
export const X402_CHECK_DAYS = 7;
/** Full runs included after payment: the report, plus one re-check. */
export const X402_CHECK_RUNS = 2;
export const X402_CHECK_FREE_PER_HOUR = 30;
export const X402_CHECK_STARTS_PER_HOUR = 8;

export const X402_CHECK_PATH = "/x402-check";
export const X402_CHECK_API_PATH = "/api/v1/x402-check";
export const X402_CHECK_REPORT_PATH = "/api/v1/x402-check/report";

export const X402_CHECK_LINE =
  "Full report is $19. You get every check, a copy-paste fix, and one free re-check within 7 days.";
/** Coinbase publishes this validator. We are not the only checker. */
export const X402_CHECK_VALIDATOR_LINE =
  "Also run Coinbase's free validator first: POST https://api.cdp.coinbase.com/platform/v2/x402/validate. This check is not the only one.";
/** Version fields, query string, trailing slash, and payTo stay on the paid report. */
export const X402_CHECK_FREE_LINE =
  "The free check covers the 402 reply, https on resource.url, the Bazaar extension, fields Coinbase may drop (description, name, tags, and icon), an example that returns 400 or 409, the PAYMENT-REQUIRED header size, and a schema $ref or $id that points outside the document. Version fields, query string, trailing slash, and payTo are on the $19 report. Also run Coinbase's free validator first: POST https://api.cdp.coinbase.com/platform/v2/x402/validate. This check is not the only one.";
export const X402_CHECK_HONESTY = "We keep the fee. You pay us directly in USDC.";
export const X402_CHECK_PAY_LINE = "Pay on Base or Solana.";
export const X402_CHECK_CAVEAT =
  "Some misses are on Coinbase's side. A pass does not mean Coinbase will list you. We do not speak for Coinbase.";
export const X402_CHECK_HIRE_LINE = "Hire us, we fix it with you";
export const X402_CHECK_DIRECTORY_LINE =
  "List the agent in the directory, free, or feature it for $19.";

export const X402_CHECK_PAGE_URL = "https://agent-control.net/x402-check";
export const X402_CHECK_API_URL = "https://agent-control.net/api/v1/x402-check";
export const X402_CHECK_REPORT_URL = "https://agent-control.net/api/v1/x402-check/report";
