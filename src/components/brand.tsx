import { cn } from "@/lib/utils";

/** Node Shield — filled heater, punched node + lateral channels, inner agent dot. */
export function ShieldMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-primary", className)}
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M16 2.2 26.7 6.5v8.3c0 6.7-4.7 12.2-10.7 14.1C10 27 5.3 21.5 5.3 14.8V6.5L16 2.2Zm0 9.9a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6ZM7.5 14.55h5.05v1.7H7.5zm11.95 0H24.5v1.7h-5.05z"
      />
      <circle cx="16" cy="15.4" r="1.45" fill="currentColor" />
    </svg>
  );
}

export function Logo({
  compact = false,
  size = "md",
}: {
  compact?: boolean;
  size?: "md" | "lg";
}) {
  const large = size === "lg";
  return (
    <div className={cn("flex items-center", large ? "gap-3" : "gap-2.5")}>
      <ShieldMark className={cn("shrink-0", large ? "size-10" : "size-7")} />
      {!compact && (
        <span
          className={cn(
            "font-semibold tracking-tight",
            large ? "text-xl md:text-2xl" : "text-sm",
          )}
        >
          Agent Control
        </span>
      )}
    </div>
  );
}
