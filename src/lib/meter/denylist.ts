/** Fixture + small static sink list. Scan is information only — never blocks a send. */
export const SCAN_SINK_FIXTURE = "MeterSink111111111111111111111111111111111";

const SINKS = new Set(
  [
    SCAN_SINK_FIXTURE,
    // lowercase evm-style fixture for tests
    "0x000000000000000000000000000000000000dEaD",
  ].map((a) => a.toLowerCase()),
);

export function isListedSink(address: string): boolean {
  return SINKS.has(address.trim().toLowerCase());
}
