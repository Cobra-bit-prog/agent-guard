/**
 * Crawler discovery for Agent Meter.
 * GET /.well-known/x402 and /.well-known/agent-card.json.
 * Origin and payTo are pinned — never from Host or a request body.
 */

import { SOLANA_PAYOUT_ADDRESS, USDC_MINT } from "../solana-pay.ts";
import {
  LOOK_QUESTION,
  LOOK_RISKS,
  METER_FREE_LOOKS,
  METER_FREE_THEN_LOOK,
  METER_LOOK,
  METER_LOOK_SKU,
  METER_LOOK_USD,
} from "./pricing.ts";

export const PUBLIC_ORIGIN = "https://agent-control.net";
export const X402_WELL_KNOWN_PATH = "/.well-known/x402";
export const AGENT_CARD_PATH = "/.well-known/agent-card.json";
export const AGENT_JSON_PATH = "/.well-known/agent.json";
export const OPENAPI_METER_PATH = "/openapi-meter.json";

export const METER_DISCOVERY_LEAD = `${LOOK_QUESTION} First 5 free. Then $0.02. No inbox.`;

export const WELL_KNOWN_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Agent-Pass",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Cache-Control": "public, max-age=3600",
} as const;

const PASS_URL = `${PUBLIC_ORIGIN}/api/v1/meter/pass`;
const SCAN_URL = `${PUBLIC_ORIGIN}/api/v1/meter/scan`;
const PRICING_URL = `${PUBLIC_ORIGIN}/api/v1/meter/pricing`;
const MCP_URL = `${PUBLIC_ORIGIN}/api/v1/mcp`;
const DOCS_URL = `${PUBLIC_ORIGIN}/docs#agent-meter`;

/** Look-door accepts. Same payTo / asset / amount as the live 402 challenge. */
export function meterLookAccepts() {
  return [
    {
      scheme: "exact",
      network: "solana",
      maxAmountRequired: METER_LOOK.amount_base_units,
      amount: METER_LOOK.amount_base_units,
      payTo: SOLANA_PAYOUT_ADDRESS,
      asset: USDC_MINT,
      extra: {
        sku: METER_LOOK_SKU,
        price_usd: METER_LOOK_USD,
        symbol: "USDC",
        decimals: 6,
        resource: PASS_URL,
        question: LOOK_QUESTION,
      },
    },
  ];
}

export function x402WellKnown() {
  return {
    x402Version: 2,
    kind: "resource-server",
    name: "Agent Meter",
    description: `${METER_DISCOVERY_LEAD} Solana USDC look door. Human App is separate.`,
    accepts: meterLookAccepts(),
    resources: [
      {
        url: PASS_URL,
        method: "POST",
        description: `Look door. Empty body {} → HTTP 402 look $${METER_LOOK_USD} Solana USDC. ${METER_FREE_THEN_LOOK}`,
      },
      {
        url: SCAN_URL,
        method: "POST",
        description: `${LOOK_QUESTION} ${METER_FREE_THEN_LOOK} Header X-Agent-Pass.`,
      },
      {
        url: PRICING_URL,
        method: "GET",
        description: `Public catalog. Default sku ${METER_LOOK_SKU} $${METER_LOOK_USD}.`,
      },
    ],
    docs: DOCS_URL,
    contact: "support@agent-control.net",
    openapi: `${PUBLIC_ORIGIN}${OPENAPI_METER_PATH}`,
    mcp: MCP_URL,
    updated: "2026-09-12T00:00:00Z",
  };
}

export function agentCard() {
  return {
    name: "Agent Control",
    description: `${METER_DISCOVERY_LEAD} Agent Meter is public. Human App is separate.`,
    version: "1.0.0",
    protocolVersion: "1.0",
    url: MCP_URL,
    provider: {
      organization: "Agent Control",
      url: PUBLIC_ORIGIN,
    },
    documentationUrl: DOCS_URL,
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    supportedInterfaces: [
      {
        url: MCP_URL,
        protocolBinding: "HTTP+JSON",
        protocolVersion: "2025-06-18",
      },
    ],
    skills: [
      {
        id: "meter-look",
        name: LOOK_QUESTION,
        description: `${METER_FREE_THEN_LOOK} Risk ${LOOK_RISKS.join("|")}. No inbox. No email. No API key.`,
        tags: ["meter", "x402", "solana", "usdc", "look"],
        examples: [`POST ${PASS_URL} {}`, `POST ${SCAN_URL}`],
      },
      {
        id: "human-app",
        name: "Human App (separate)",
        description:
          "Spend limits and Approval Inbox. Humans pay $29. Agents use a Bearer API key. Not the Meter look door.",
        tags: ["human-app", "inbox"],
      },
    ],
  };
}

export function meterOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Agent Meter",
      version: "1.0.0",
      description: `${METER_DISCOVERY_LEAD} ${METER_FREE_THEN_LOOK} Solana USDC to ${SOLANA_PAYOUT_ADDRESS}. Human App is separate.`,
    },
    servers: [{ url: PUBLIC_ORIGIN }],
    paths: {
      "/api/v1/meter/pricing": {
        get: {
          summary: "Public Meter catalog",
          description: `${LOOK_QUESTION} ${METER_FREE_THEN_LOOK} Default sku look.`,
          responses: {
            "200": { description: "Catalog. default_sku is look. funds.pay_to is locked." },
          },
        },
      },
      "/api/v1/meter/pass": {
        post: {
          summary: "Look door",
          description: `Empty body {} mints look $${METER_LOOK_USD}. No release without payment. First ${METER_FREE_LOOKS} looks on an X-Agent-Pass id are free.`,
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sku: { type: "string", enum: ["look", "looks_20", "addresses_100", "stamp_tx"] },
                  },
                },
              },
            },
          },
          responses: {
            "402": {
              description: `Pay look $${METER_LOOK_USD} Solana USDC to the locked payTo with the invoice reference.`,
            },
            "200": { description: "Pass issued after proof or a prior payment watch." },
          },
        },
      },
      "/api/v1/meter/scan": {
        post: {
          summary: LOOK_QUESTION,
          description: `${METER_FREE_THEN_LOOK} Header X-Agent-Pass.`,
          parameters: [
            {
              name: "X-Agent-Pass",
              in: "header",
              required: false,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["chain", "address"],
                  properties: {
                    chain: { type: "string", enum: ["solana", "ethereum", "base"] },
                    address: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "risk ok|new|warn|sink. Never hold." },
            "402": { description: "Look door after free looks are used." },
          },
        },
      },
    },
  };
}

export function isMeterWellKnownPath(pathname: string): boolean {
  return pathname === X402_WELL_KNOWN_PATH || pathname === AGENT_CARD_PATH || pathname === AGENT_JSON_PATH;
}

export function wellKnownJson(
  body: unknown,
  status = 200,
  extra?: Record<string, string>,
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...WELL_KNOWN_CORS,
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}

export function handleMeterWellKnown(request: Request): Response | null {
  const url = new URL(request.url);
  if (!isMeterWellKnownPath(url.pathname)) return null;
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: WELL_KNOWN_CORS });
  }
  if (method !== "GET" && method !== "HEAD") {
    return wellKnownJson({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD, OPTIONS" });
  }
  if (url.pathname === AGENT_JSON_PATH) {
    return new Response(null, {
      status: 308,
      headers: {
        ...WELL_KNOWN_CORS,
        Location: AGENT_CARD_PATH,
      },
    });
  }
  const body = url.pathname === AGENT_CARD_PATH ? agentCard() : x402WellKnown();
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { ...WELL_KNOWN_CORS, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return wellKnownJson(body);
}
