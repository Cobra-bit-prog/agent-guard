import { ChainMark } from "@/components/chain-icons";
import { Badge } from "@/components/ui/badge";
import { CHAINS, type ChainId } from "@/lib/chains";
import type { AgentRow } from "@/lib/server/guard";

export function StatusBadge({ status }: { status: AgentRow["status"] }) {
  const label = status[0].toUpperCase() + status.slice(1);
  return <Badge variant={status}>{label}</Badge>;
}

export function ChainBadge({ chain }: { chain: ChainId }) {
  return (
    <Badge variant="primary" className="gap-1 pl-1 pr-2">
      <ChainMark chain={chain} className="size-3.5" />
      {CHAINS[chain].name}
    </Badge>
  );
}

export function SpendTone(pct: number) {
  if (pct >= 90) return "danger" as const;
  if (pct >= 65) return "warning" as const;
  return "success" as const;
}
