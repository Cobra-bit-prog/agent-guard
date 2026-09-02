import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { decideApproval, getInbox } from "@/lib/server/guard";
import { formatUsd, shortAddress, timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["inbox"],
    queryFn: () => getInbox(),
    refetchInterval: 4000,
  });
  const decide = useMutation({
    mutationFn: (input: { id: string; decision: "allow" | "always" | "block" }) =>
      decideApproval({ data: input }),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.decision === "block"
          ? "Blocked. The agent must not sign."
          : vars.decision === "always"
            ? "Allowed. This address is now on the allowlist."
            : "Allowed once. The agent may sign this send.",
      );
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["holds-count"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return <p className="text-sm text-danger">Could not load the inbox.</p>;
  }

  const items = q.data.items;
  const writable = q.data.writable;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waiting for you</h1>
        <p className="text-sm text-muted">
          Off-policy and first-time destinations pause here if the agent hooked check before it
          signs. The agent must not send until you decide, or the request expires (10 minutes).
        </p>
      </div>

      {items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Inbox className="size-8 text-subtle" />
            <p className="text-sm text-muted">
              Inbox clear. Unknown destinations and over-cap sends wait here when the agent hook is
              connected.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <Card key={it.id}>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning">Waiting for you</Badge>
                    <span className="text-sm font-medium">
                      {it.agent_name ?? "Agent"}
                      {it.chain ? ` · ${it.chain}` : ""}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted">
                    {shortAddress(it.to_address, 6)}
                  </p>
                  <p className="mt-1 text-sm text-muted">{it.reasons[0]}</p>
                  <p className="text-xs text-subtle">{timeAgo(it.created_at)}</p>
                </div>
                <p className="text-2xl font-semibold tabular-nums tracking-tight">
                  {formatUsd(it.value_usd)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  disabled={!writable || decide.isPending}
                  onClick={() => decide.mutate({ id: it.id, decision: "allow" })}
                >
                  Allow once
                </Button>
                <Button
                  className="min-h-11"
                  variant="secondary"
                  disabled={!writable || decide.isPending}
                  onClick={() => decide.mutate({ id: it.id, decision: "always" })}
                >
                  Always allow this address
                </Button>
                <Button
                  className="min-h-11"
                  variant="danger"
                  disabled={!writable || decide.isPending}
                  onClick={() => decide.mutate({ id: it.id, decision: "block" })}
                >
                  Block
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
