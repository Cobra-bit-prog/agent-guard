/**
 * CDP Bazaar discovery metadata for Agent Meter 402s.
 * Advertised on PAYMENT-REQUIRED (and JSON 402 body) plus well-known resources.
 * Payout wallets stay locked. Do not mention facilitator here — that is Admin-only.
 */

export const METER_BAZAAR_ORIGIN = "https://agent-control.net";

/** CDP Facilitator rejects resource.description over 500 characters. */
export const METER_BAZAAR_DESCRIPTION =
  "Can I pay this address? ok · new · warn · sink. First 5 free. Then $0.10 USDC per look. Packs: 20 looks $0.20 · 100-address $0.15 · stamp $0.05. Agents pay themselves. No inbox. Base USDC + Solana USDC.";

export const METER_BAZAAR_SERVICE_NAME = "Agent Meter";
export const METER_BAZAAR_MIME = "application/json";
export const METER_BAZAAR_TAGS = ["meter", "usdc", "base", "solana", "look"] as const;

export const METER_BAZAAR_RESOURCE_URLS = {
  pass: `${METER_BAZAAR_ORIGIN}/api/v1/meter/pass`,
  scan: `${METER_BAZAAR_ORIGIN}/api/v1/meter/scan`,
  preflight: `${METER_BAZAAR_ORIGIN}/api/v1/meter/preflight`,
  scan_batch: `${METER_BAZAAR_ORIGIN}/api/v1/meter/scan-batch`,
  stamp: `${METER_BAZAAR_ORIGIN}/api/v1/meter/stamp`,
} as const;

export type MeterBazaarKind = keyof typeof METER_BAZAAR_RESOURCE_URLS;

const SKU_ENUM = ["look", "looks_20", "addresses_100", "stamp_tx"] as const;

type JsonSchema = Record<string, unknown>;

export type MeterBazaarInput = {
  type: "http";
  method: "POST";
  bodyType: "json";
  body: Record<string, unknown>;
};

export type MeterBazaarExtension = {
  info: {
    input: MeterBazaarInput;
    output: {
      type: "json";
      example: Record<string, unknown>;
    };
  };
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema";
    type: "object";
    properties: {
      input: JsonSchema;
      output: JsonSchema;
    };
    required: ["input"];
  };
};

export type MeterBazaarResource = {
  url: string;
  description: string;
  mimeType: string;
  serviceName: string;
  tags: string[];
};

const BODY_METHODS = ["POST", "PUT", "PATCH"] as const;

function postBodyExtension(
  body: Record<string, unknown>,
  bodySchema: JsonSchema,
  outputExample: Record<string, unknown>,
): MeterBazaarExtension {
  return {
    info: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        body,
      },
      output: {
        type: "json",
        example: outputExample,
      },
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        input: {
          type: "object",
          properties: {
            type: { type: "string", const: "http" },
            method: { type: "string", enum: [...BODY_METHODS] },
            bodyType: { type: "string", enum: ["json", "form-data", "text"] },
            body: bodySchema,
          },
          required: ["type", "method", "bodyType", "body"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: {
            type: { type: "string" },
            example: { type: "object" },
          },
          required: ["type"],
        },
      },
      required: ["input"],
    },
  };
}

const PASS_BODY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    sku: {
      type: "string",
      enum: [...SKU_ENUM],
      description: "Omit for looks_20 $0.20 pack. sku look is $0.10 one look.",
    },
  },
  additionalProperties: false,
};

const SCAN_BODY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    chain: {
      type: "string",
      enum: ["solana", "ethereum", "base"],
      description: "Chain of the destination address",
    },
    address: {
      type: "string",
      description: "Destination address to look up",
    },
  },
  required: ["chain", "address"],
  additionalProperties: false,
};

const PREFLIGHT_BODY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    chain: { type: "string", enum: ["solana", "ethereum", "base"] },
    wallet: { type: "string", description: "Agent wallet about to send" },
    to: { type: "string", description: "Destination address" },
    value_usd: { type: "number", description: "USD value of the send" },
    cap_usd: { type: "number", description: "Daily cap in USD" },
  },
  required: ["chain", "wallet", "to", "value_usd", "cap_usd"],
  additionalProperties: false,
};

const SCAN_BATCH_BODY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    chain: { type: "string", enum: ["solana", "ethereum", "base"] },
    addresses: {
      type: "array",
      items: { type: "string" },
      maxItems: 100,
      description: "Up to 100 destination addresses",
    },
  },
  required: ["chain", "addresses"],
  additionalProperties: false,
};

const STAMP_BODY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    chain: { type: "string", enum: ["solana", "ethereum", "base"] },
    tx: { type: "string", description: "Transaction signature or hash" },
  },
  required: ["chain", "tx"],
  additionalProperties: false,
};

const PASS_OUTPUT = {
  token: "agent-pass-token",
  invoice_id: "inv_example",
  status: "paid",
  header: "X-Agent-Pass",
  next: "Retry scan with X-Agent-Pass set to this token. We never take keys.",
};

const SCAN_OUTPUT = {
  question: "Can I pay this address?",
  risk: "ok",
  reason: "known_destination",
  chain: "solana",
  address: "11111111111111111111111111111111",
};

const PREFLIGHT_OUTPUT = {
  question: "Can I pay this address?",
  decision: "allow",
  must_abort: false,
  remaining_usd: 90,
};

const SCAN_BATCH_OUTPUT = {
  question: "Can I pay this address?",
  results: [{ address: "11111111111111111111111111111111", risk: "ok" }],
};

const STAMP_OUTPUT = {
  id: "stamp_example",
  ticket: "Take this ticket or we do not take your USDC.",
};

const BY_KIND: Record<MeterBazaarKind, MeterBazaarExtension> = {
  pass: postBodyExtension({}, PASS_BODY_SCHEMA, PASS_OUTPUT),
  scan: postBodyExtension(
    { chain: "solana", address: "11111111111111111111111111111111" },
    SCAN_BODY_SCHEMA,
    SCAN_OUTPUT,
  ),
  preflight: postBodyExtension(
    {
      chain: "solana",
      wallet: "11111111111111111111111111111111",
      to: "11111111111111111111111111111111",
      value_usd: 10,
      cap_usd: 100,
    },
    PREFLIGHT_BODY_SCHEMA,
    PREFLIGHT_OUTPUT,
  ),
  scan_batch: postBodyExtension(
    { chain: "solana", addresses: ["11111111111111111111111111111111"] },
    SCAN_BATCH_BODY_SCHEMA,
    SCAN_BATCH_OUTPUT,
  ),
  stamp: postBodyExtension(
    { chain: "solana", tx: "5exampleStampTxSignature" },
    STAMP_BODY_SCHEMA,
    STAMP_OUTPUT,
  ),
};

export function meterBazaarKindFromSource(source: string | null | undefined): MeterBazaarKind {
  if (source === "http_scan") return "scan";
  if (source === "http_preflight") return "preflight";
  if (source === "http_scan_batch") return "scan_batch";
  if (source === "http_stamp") return "stamp";
  return "pass";
}

export function meterBazaarResourceUrl(kind: MeterBazaarKind = "pass"): string {
  return METER_BAZAAR_RESOURCE_URLS[kind];
}

export function meterBazaarResource(kind: MeterBazaarKind = "pass"): MeterBazaarResource {
  return {
    url: meterBazaarResourceUrl(kind),
    description: METER_BAZAAR_DESCRIPTION,
    mimeType: METER_BAZAAR_MIME,
    serviceName: METER_BAZAAR_SERVICE_NAME,
    tags: [...METER_BAZAAR_TAGS],
  };
}

export function meterBazaarExtension(kind: MeterBazaarKind = "pass"): MeterBazaarExtension {
  return BY_KIND[kind];
}

export function meterBazaarExtensions(kind: MeterBazaarKind = "pass"): { bazaar: MeterBazaarExtension } {
  return { bazaar: meterBazaarExtension(kind) };
}

export function assertMeterBazaarDescriptionBound(description = METER_BAZAAR_DESCRIPTION): string {
  if (description.length === 0 || description.length > 500) {
    throw new Error("Bazaar description must be 1–500 characters.");
  }
  return description;
}
