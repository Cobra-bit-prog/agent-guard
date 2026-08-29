import { useMemo } from "react";
import { encode } from "@/lib/qr/encode";

/** On-device SVG QR. No CDN, so Safari content blockers cannot hide it. */
export function PayQr({ value, alt }: { value: string; alt?: string }) {
  const encoded = useMemo(() => {
    const text = value.trim();
    if (!text) return { error: "missing" as const };
    try {
      const result = encode(text, { ecc: "M", border: 2 });
      return { error: null, size: result.size, data: result.data };
    } catch {
      return { error: "draw" as const };
    }
  }, [value]);

  if (encoded.error === "missing") {
    return (
      <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Payment QR is missing. Go back to Billing and tap Pay again.
      </p>
    );
  }
  if (encoded.error === "draw") {
    return (
      <p className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Could not draw this payment QR. Copy the amount and address instead.
      </p>
    );
  }

  const modules: string[] = [];
  for (let y = 0; y < encoded.size; y += 1) {
    for (let x = 0; x < encoded.size; x += 1) {
      if (encoded.data[y][x]) modules.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return (
    <svg
      role="img"
      aria-label={alt ?? "Payment QR"}
      viewBox={`0 0 ${encoded.size} ${encoded.size}`}
      className="mx-auto aspect-square h-auto w-full max-w-[280px] rounded-lg bg-white"
      shapeRendering="crispEdges"
    >
      <title>{alt ?? "Payment QR"}</title>
      <rect width={encoded.size} height={encoded.size} fill="#ffffff" />
      <path fill="#000000" d={modules.join("")} />
    </svg>
  );
}
