/** Fixture + small static sink list. Scan is information only — never blocks a send.
 * Fixture address is a deterministic off-curve 32-byte Base58 key for regression tests. */
export const SCAN_SINK_FIXTURE = "5mWoJT7n2fBpwNMLDgbE5ri8DWW3vukFzjs3BLmF1oqn";

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
