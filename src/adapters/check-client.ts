/**
 * Thin client for public POST /api/v1/check.
 * Maps the check to allow / wait (hold) / stop (block).
 * Does not change product behavior — it only calls the public API.
 */

export const DEFAULT_CHECK_ORIGIN = "https://agent-control.net";
export const CHECK_PATH = "/api/v1/check";

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<Response>;

export type CheckClientOptions = {
  apiKey: string;
  origin?: string;
  fetch?: FetchLike;
};

export type CheckInput = {
  to: string;
  value_usd: number;
  native?: string;
};

export type CheckDecision = "allow" | "alert" | "block" | "hold";

export type CheckResponse = {
  decision: CheckDecision;
  reasons: string[];
  check_id: string;
  agent_id: string;
  agent: string;
  must_abort: boolean;
  paused: boolean;
  approval_id?: string | null;
  poll_url?: string | null;
  poll_after_ms?: number;
  expires_in_s?: number;
};

/** allow = send; wait = hold (do not send yet); stop = block (do not send). */
export type CheckVerdict = "allow" | "wait" | "stop";

export type CheckOk = {
  ok: true;
  verdict: CheckVerdict;
  check: CheckResponse;
};

export type CheckErr = {
  ok: false;
  error: string;
  status?: number;
};

export type CheckOutcome = CheckOk | CheckErr;

export type AgentControlCheckClient = {
  check: (input: CheckInput) => Promise<CheckOutcome>;
};

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isCheckDecision(value: unknown): value is CheckDecision {
  return value === "allow" || value === "alert" || value === "block" || value === "hold";
}

export function parseCheckResponse(data: unknown): CheckResponse | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  if (!isCheckDecision(row.decision)) return null;
  if (typeof row.must_abort !== "boolean") return null;
  if (typeof row.check_id !== "string" || typeof row.agent_id !== "string") return null;
  if (typeof row.agent !== "string" || typeof row.paused !== "boolean") return null;
  return {
    decision: row.decision,
    reasons: asStringArray(row.reasons),
    check_id: row.check_id,
    agent_id: row.agent_id,
    agent: row.agent,
    must_abort: row.must_abort,
    paused: row.paused,
    approval_id: typeof row.approval_id === "string" ? row.approval_id : null,
    poll_url: typeof row.poll_url === "string" ? row.poll_url : null,
    poll_after_ms: typeof row.poll_after_ms === "number" ? row.poll_after_ms : undefined,
    expires_in_s: typeof row.expires_in_s === "number" ? row.expires_in_s : undefined,
  };
}

/**
 * Hold → wait (do not send yet). Block or must_abort (except hold) → stop.
 * Allow and alert → allow. Unknown → stop (fail closed).
 */
export function verdictForCheck(check: { decision: string; must_abort: boolean }): CheckVerdict {
  if (check.decision === "hold") return "wait";
  if (check.decision === "block" || check.must_abort) return "stop";
  if (check.decision === "allow" || check.decision === "alert") return "allow";
  return "stop";
}

export function validateCheckInput(input: CheckInput): string | null {
  const to = String(input.to ?? "").trim();
  const valueUsd = Number(input.value_usd);
  if (!to) return "Provide a destination.";
  if (!Number.isFinite(valueUsd) || valueUsd <= 0) return "Provide a value in USD greater than 0.";
  return null;
}

function errorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const message = (data as { error: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Check failed (${status}).`;
}

export function createCheckClient(options: CheckClientOptions): AgentControlCheckClient {
  const apiKey = String(options.apiKey ?? "").trim();
  if (!apiKey) {
    throw new Error("Missing agent API key.");
  }
  const origin = trimOrigin(options.origin?.trim() || DEFAULT_CHECK_ORIGIN);
  const fetchFn: FetchLike = options.fetch ?? globalThis.fetch;

  return {
    async check(input: CheckInput): Promise<CheckOutcome> {
      const invalid = validateCheckInput(input);
      if (invalid) return { ok: false, error: invalid };
      const to = String(input.to).trim();
      const valueUsd = Number(input.value_usd);
      const body: CheckInput = { to, value_usd: valueUsd };
      if (input.native !== undefined) body.native = input.native;

      let res: Response;
      try {
        res = await fetchFn(`${origin}${CHECK_PATH}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, error: "Network error. Do not send." };
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        return { ok: false, error: "Invalid check response.", status: res.status };
      }

      if (!res.ok) {
        return { ok: false, error: errorMessage(data, res.status), status: res.status };
      }

      const check = parseCheckResponse(data);
      if (!check) {
        return { ok: false, error: "Invalid check response.", status: res.status };
      }

      return {
        ok: true,
        verdict: verdictForCheck(check),
        check,
      };
    },
  };
}

export async function checkTransfer(
  options: CheckClientOptions,
  input: CheckInput,
): Promise<CheckOutcome> {
  return createCheckClient(options).check(input);
}
