import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/lib/server/guard";
import {
  downloadAuditReport,
  generateAuditReport,
  listAuditReports,
} from "@/lib/server/audit-reports";
import { formatUsd, shortAddress, timeAgo } from "@/lib/utils";
import type { AuditTrailRow } from "@/lib/audit-report";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
  validateSearch: (s: Record<string, unknown>) => ({
    agent: typeof s.agent === "string" ? s.agent : undefined,
  }),
});

function downloadBase64(file: { filename: string; mime: string; base64: string }) {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: file.mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function AuditPage() {
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const history = useQuery({ queryKey: ["audit-reports"], queryFn: () => listAuditReports() });
  const agents = dash.data?.agents ?? [];
  const { agent: agentFromUrl } = Route.useSearch();
  const [agentId, setAgentId] = useState(agentFromUrl ?? "");
  const [address, setAddress] = useState("");
  const [preview, setPreview] = useState<{
    id: string;
    generatedAt: string;
    disclaimer: string;
    agent: { name: string; address: string; chain: string };
    rowCount: number;
    preview: AuditTrailRow[];
  } | null>(null);

  const selected = agents.find((a) => a.id === agentId) ?? null;

  const generate = useMutation({
    mutationFn: () =>
      generateAuditReport({
        data: {
          agent_id: agentId || undefined,
          address: address.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      setPreview(r);
      toast.success("Report ready. Download Excel or PDF.");
      void qc.invalidateQueries({ queryKey: ["audit-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = useMutation({
    mutationFn: (input: { id: string; format: "xlsx" | "pdf" }) =>
      downloadAuditReport({ data: input }),
    onSuccess: (file) => {
      downloadBase64(file);
      toast.success(`Downloaded ${file.filename}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (dash.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Audit</h1>
        <p className="text-sm text-muted">
          On-demand report of this agent’s Agent Control trail — checks, alerts, operator decisions,
          and recorded transfers. Not a full chain replay. Generate, then download Excel or PDF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="audit-agent">Enrolled agent</Label>
              <select
                id="audit-agent"
                className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="">Select an agent…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.chain} {a.is_demo ? "(demo)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-address">Or paste its wallet address</Label>
              <Input
                id="audit-address"
                className="font-mono text-xs"
                placeholder="0x… or Solana address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
          {selected && <p className="font-mono text-xs text-subtle">{selected.address}</p>}
          <Button
            className="min-h-11"
            disabled={generate.isPending || (!agentId && !address.trim())}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? "Generating…" : "Generate report"}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>
                {preview.agent.name} · {preview.rowCount} row{preview.rowCount === 1 ? "" : "s"}
              </CardTitle>
              <p className="mt-1 text-xs text-muted">{preview.disclaimer}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={download.isPending}
                onClick={() => download.mutate({ id: preview.id, format: "xlsx" })}
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </Button>
              <Button
                variant="secondary"
                disabled={download.isPending}
                onClick={() => download.mutate({ id: preview.id, format: "pdf" })}
              >
                <FileText className="size-4" />
                PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-subtle">
                  <th className="border-b border-border py-2 pr-3">Time</th>
                  <th className="border-b border-border py-2 pr-3">Kind</th>
                  <th className="border-b border-border py-2 pr-3">Chain</th>
                  <th className="border-b border-border py-2 pr-3">To</th>
                  <th className="border-b border-border py-2 pr-3">Amount</th>
                  <th className="border-b border-border py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-sm text-muted">
                      No Agent Control history for this agent yet.
                    </td>
                  </tr>
                )}
                {preview.preview.map((row, i) => (
                  <tr key={`${row.timestamp}-${i}`}>
                    <td className="whitespace-nowrap border-t border-border py-2 pr-3 text-xs text-muted">
                      {timeAgo(row.timestamp)}
                    </td>
                    <td className="border-t border-border py-2 pr-3">
                      <Badge>{row.kind}</Badge>
                    </td>
                    <td className="border-t border-border py-2 pr-3 text-xs">{row.chain}</td>
                    <td className="border-t border-border py-2 pr-3 font-mono text-xs">
                      {row.to === "—" ? "—" : shortAddress(row.to, 4)}
                    </td>
                    <td className="border-t border-border py-2 pr-3 tabular-nums">
                      {row.amountUsd === null ? "—" : formatUsd(row.amountUsd)}
                    </td>
                    <td className="border-t border-border py-2 text-sm">{row.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Previous reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(history.data?.reports.length ?? 0) === 0 && (
            <p className="text-sm text-muted">No reports yet. Generate one above.</p>
          )}
          {history.data?.reports.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0 first:pt-0"
            >
              <div>
                <p className="text-sm font-medium">
                  {r.agent_name} · {r.row_count} rows
                </p>
                <p className="text-xs text-subtle">{timeAgo(r.created_at)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={download.isPending}
                  onClick={() => download.mutate({ id: r.id, format: "xlsx" })}
                >
                  Excel
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={download.isPending}
                  onClick={() => download.mutate({ id: r.id, format: "pdf" })}
                >
                  PDF
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
