import { useId } from "react";
import { CHAINS, DISPLAY_CHAIN_ORDER, type ChainId } from "@/lib/chains";
import { cn } from "@/lib/utils";
/** Original geometric marks used only to label supported networks. */
export function EthereumMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <path fill="#8C93C0" d="M16 3.2 24.9 16.3 16 21.4z" />
      <path fill="#627EEA" d="M16 3.2 7.1 16.3 16 21.4z" />
      <path fill="#8C93C0" d="M16 22.6 24.9 17.5 16 28.8z" />
      <path fill="#3C4270" d="M16 22.6 7.1 17.5 16 28.8z" />
    </svg>
  );
}

export function SolanaMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient
          id={`sol-${uid}`}
          x1="6"
          y1="8"
          x2="26"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#14F195" />
          <stop offset="1" stopColor="#9945FF" />
        </linearGradient>
      </defs>
      <path fill={`url(#sol-${uid})`} d="M7.4 9.2h15.2l3.2 3.6H10.6z" />
      <path fill={`url(#sol-${uid})`} d="M7.4 14.2h15.2l3.2 3.6H10.6z" />
      <path fill={`url(#sol-${uid})`} d="M7.4 19.2h15.2l3.2 3.6H10.6z" />
    </svg>
  );
}

export function BaseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect x="4" y="4" width="24" height="24" rx="7" fill="#0052FF" />
    </svg>
  );
}

export function ChainMark({
  chain,
  className,
}: {
  chain: ChainId;
  className?: string;
}) {
  if (chain === "ethereum") return <EthereumMark className={className} />;
  if (chain === "solana") return <SolanaMark className={className} />;
  return <BaseMark className={className} />;
}

/** Slim marketing row — not a partner wall. */
export function SupportedChains({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <p className="text-xs font-medium text-muted">Works on</p>
      <ul
        className="flex flex-wrap items-center gap-1.5"
        aria-label="Supported networks: Solana, Ethereum, and Base"
      >
        {DISPLAY_CHAIN_ORDER.map((id) => {
          const c = CHAINS[id];
          return (
            <li
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[13px] text-fg shadow-[0_1px_0_rgb(18_38_63/0.04)]"
            >
              <ChainMark chain={c.id} className="size-4" />
              {c.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
