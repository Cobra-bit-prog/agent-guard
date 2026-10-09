import { CopyCode } from "@/components/copy-code";
import {
  OTHER_AGENT_APPS_FALLBACK_LABEL,
  OTHER_AGENT_APPS_FALLBACK_PROMPT,
  OTHER_AGENT_APPS_FEATURED_LINE,
  OTHER_AGENT_APPS_FREE_TOOLS,
  OTHER_AGENT_APPS_HEADING,
  OTHER_AGENT_APPS_MCP_LABEL,
  OTHER_AGENT_APPS_MCP_URL,
  OTHER_AGENT_APPS_PASTE_PROMPT,
} from "@/lib/other-agent-apps";

export function OtherAgentApps({ className = "mt-10" }: { className?: string }) {
  return (
    <section
      id="other-agent-apps"
      className={`scroll-mt-6 rounded-[20px] border border-border bg-surface p-6 shadow-[0_16px_40px_-20px_rgb(18_38_63/0.18)] ${className}`}
    >
      <h2 className="text-title font-semibold tracking-tight">{OTHER_AGENT_APPS_HEADING}</h2>
      <p className="mt-3 max-w-[52ch] text-body text-muted">
        Free MCP, no sign-in needed:{" "}
        <a href={OTHER_AGENT_APPS_MCP_URL} className="font-medium text-navy hover:text-coral">
          {OTHER_AGENT_APPS_MCP_URL}
        </a>
        . Free tools: {OTHER_AGENT_APPS_FREE_TOOLS.join(", ")}.
      </p>
      <p className="mt-4 max-w-[52ch] text-body text-fg">{OTHER_AGENT_APPS_MCP_LABEL}</p>
      <CopyCode code={OTHER_AGENT_APPS_PASTE_PROMPT} label="Copy" />
      <p className="mt-4 max-w-[52ch] text-body text-fg">{OTHER_AGENT_APPS_FALLBACK_LABEL}</p>
      <CopyCode code={OTHER_AGENT_APPS_FALLBACK_PROMPT} label="Copy" />
      <p className="mt-4 max-w-[52ch] text-body text-fg">{OTHER_AGENT_APPS_FEATURED_LINE}</p>
    </section>
  );
}
