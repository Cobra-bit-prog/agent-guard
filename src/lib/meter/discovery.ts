/**
 * Crawler discovery for Agent Meter.
 * GET /.well-known/x402, /.well-known/agent-card.json, and /.well-known/mcp.json.
 * Origin and payTo are pinned — never from Host or a request body.
 */

import { SOLANA_PAYOUT_ADDRESS } from "../solana-pay.ts";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { meterLookAccepts } from "./accepts.ts";
import {
  METER_BAZAAR_DESCRIPTION,
  METER_BAZAAR_MIME,
  meterBazaarExtensions,
} from "./bazaar.ts";
import {
  LOOK_QUESTION,
  LOOK_RISKS,
  METER_AGENT_LEAD,
  METER_FREE_LOOKS,
  METER_LOOK_SKU,
  METER_LOOK_USD_LABEL,
  METER_PACKS_FIRST,
  METER_PAID_SKU,
} from "./pricing.ts";

export const PUBLIC_ORIGIN = "https://agent-control.net";
export const X402_WELL_KNOWN_PATH = "/.well-known/x402";
export const AGENT_CARD_PATH = "/.well-known/agent-card.json";
export const AGENT_JSON_PATH = "/.well-known/agent.json";
export const MCP_WELL_KNOWN_PATH = "/.well-known/mcp.json";
export const OPENAPI_METER_PATH = "/openapi-meter.json";

export const METER_DISCOVERY_LEAD = METER_AGENT_LEAD;

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

/** Look-door accepts. Dual rail: Solana USDC + Base USDC (EIP-3009 exact). */
export { meterLookAccepts } from "./accepts.ts";

export function x402WellKnown() {
  return {
    x402Version: 2,
    kind: "resource-server",
    name: "Agent Meter",
    description: `${METER_DISCOVERY_LEAD} Base USDC (EIP-3009 exact) and Solana USDC. Human App is separate.`,
    accepts: meterLookAccepts(),
    resources: [
      {
        url: PASS_URL,
        method: "POST",
        mimeType: METER_BAZAAR_MIME,
        description: METER_BAZAAR_DESCRIPTION,
        extensions: meterBazaarExtensions("pass"),
      },
      {
        url: SCAN_URL,
        method: "POST",
        mimeType: METER_BAZAAR_MIME,
        description: METER_BAZAAR_DESCRIPTION,
        extensions: meterBazaarExtensions("scan"),
      },
      {
        url: PRICING_URL,
        method: "GET",
        description: `Public catalog. ${METER_PACKS_FIRST} Empty POST /meter/pass = ${METER_PAID_SKU} $0.20. Optional {"sku":"${METER_LOOK_SKU}"} = $${METER_LOOK_USD_LABEL} one-shot.`,
      },
    ],
    docs: DOCS_URL,
    contact: "support@agent-control.net",
    openapi: `${PUBLIC_ORIGIN}${OPENAPI_METER_PATH}`,
    mcp: MCP_URL,
    updated: "2026-09-20T00:00:00Z",
  };
}

/** Public MCP discovery for crawlers. Streamable HTTP at /api/v1/mcp. */
export function mcpWellKnown() {
  return {
    name: "net.agent-control/agent-control",
    title: "Agent Control",
    description: `${METER_AGENT_LEAD} Agent Meter is public (no Authorization / Bearer empty). Human App is separate ($29).`,
    version: "1.0.0",
    mcp: MCP_URL,
    transport: "streamable-http" as const,
    remotes: [
      {
        type: "streamable-http" as const,
        url: MCP_URL,
      },
    ],
    products: {
      meter: `${METER_AGENT_LEAD} Meter meter_* tools: no Authorization / Bearer empty.`,
      human_app:
        "Spend limits and Approval Inbox. Humans pay $29. Agents use a Bearer API key.",
    },
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
        description: `First 5 free. ${METER_PACKS_FIRST} Risk ${LOOK_RISKS.join("|")}. Base USDC (EIP-3009 exact) and Solana USDC. No inbox. No email. No API key.`,
        tags: ["meter", "x402", "solana", "base", "usdc", "look"],
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
      description: `${METER_DISCOVERY_LEAD} Base USDC (EIP-3009 exact) to ${EVM_PAYOUT_ADDRESS}. Solana USDC to ${SOLANA_PAYOUT_ADDRESS}. Human App is separate.`,
    },
    servers: [{ url: PUBLIC_ORIGIN }],
    paths: {
      "/api/v1/meter/pricing": {
        get: {
          summary: "Public Meter catalog",
          description: `${LOOK_QUESTION} First 5 free. ${METER_PACKS_FIRST} Default sku look. Paid sku looks_20.`,
          responses: {
            "200": { description: "Catalog. default_sku is look. paid_sku is looks_20. funds.pay_to is locked." },
          },
        },
      },
      "/api/v1/meter/pass": {
        get: {
          summary: "Pass probe / challenge",
          description: `Same 402 Payment-Required as empty POST (default sku looks_20 $0.20). Probe/challenge only. POST remains the canonical buy. ${METER_PACKS_FIRST}`,
          responses: {
            "402": {
              description: "PAYMENT-REQUIRED header + looks_20 invoice body + extensions.bazaar.",
            },
          },
        },
        post: {
          summary: "Look door",
          description: `Empty body {} invoices looks_20 $0.20 pack. Optional {"sku":"look"} is $0.10 one-shot. ${METER_PACKS_FIRST} No release without payment. First ${METER_FREE_LOOKS} looks on an X-Agent-Pass id are free.`,
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
              description: `Prefer Base USDC (EIP-3009 exact) to the locked base_pay_to (CDP/AgentKit; no Solana key). Optional Solana USDC to payTo. ${METER_PACKS_FIRST}`,
            },
            "200": { description: "Pass issued after proof or a prior payment watch." },
          },
        },
      },
      "/api/v1/meter/scan": {
        post: {
          summary: LOOK_QUESTION,
          description: `First 5 free. ${METER_PACKS_FIRST} Header X-Agent-Pass.`,
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
            "402": { description: `${METER_PACKS_FIRST}` },
          },
        },
      },
      "/api/v1/gate/demo": {
        get: {
          summary: "Dogfood merchant stamp gate",
          description:
            "Header X-Stamp-Id. No verified allow stamp → 402 stamp_tx $0.05. verified true and decision allow → 200. Does not mint an invoice. Take this ticket or we do not take your USDC.",
          parameters: [
            {
              name: "X-Stamp-Id",
              in: "header",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Gate open. ok true. No secrets." },
            "402": { description: "Buy stamp_tx $0.05, mint an allow stamp, retry with X-Stamp-Id." },
          },
        },
        post: {
          summary: "Dogfood merchant stamp gate",
          description: "Same as GET. Header X-Stamp-Id. stamp_tx $0.05.",
          parameters: [
            {
              name: "X-Stamp-Id",
              in: "header",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Gate open. ok true. No secrets." },
            "402": { description: "Buy stamp_tx $0.05, mint an allow stamp, retry with X-Stamp-Id." },
          },
        },
      },
    },
  };
}

export function isMeterWellKnownPath(pathname: string): boolean {
  return (
    pathname === X402_WELL_KNOWN_PATH ||
    pathname === AGENT_CARD_PATH ||
    pathname === AGENT_JSON_PATH ||
    pathname === MCP_WELL_KNOWN_PATH
  );
}

function meterWellKnownBody(pathname: string) {
  if (pathname === AGENT_CARD_PATH) return agentCard();
  if (pathname === MCP_WELL_KNOWN_PATH) return mcpWellKnown();
  return x402WellKnown();
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
  const body = meterWellKnownBody(url.pathname);
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { ...WELL_KNOWN_CORS, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return wellKnownJson(body);
}
