import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { SIGN_IN_PATH } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listConsentAgents } from "@/lib/oauth/consent";
import {
  CONSENT_ALLOW,
  CONSENT_DENY,
  CONSENT_EYEBROW,
  CONSENT_HEADLINE,
  CONSENT_HUMAN_LINE,
  CONSENT_KEYS,
  CONSENT_LEDE,
  CONSENT_NO_AGENTS,
  CONSENT_PICK_AGENT,
  CONSENT_SIGN_IN,
  CONSENT_WHAT,
  CONSENT_WHAT_HEADING,
} from "@/lib/oauth/copy";

type AuthorizeSearch = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  resource?: string;
};

export const Route = createFileRoute("/oauth/authorize")({
  component: AuthorizePage,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAuthorizePost } = await import("@/lib/oauth/authorize.server");
        return handleAuthorizePost(request);
      },
    },
  },
  validateSearch: (search: Record<string, unknown>): AuthorizeSearch => ({
    response_type: str(search.response_type),
    client_id: str(search.client_id),
    redirect_uri: str(search.redirect_uri),
    state: str(search.state),
    code_challenge: str(search.code_challenge),
    code_challenge_method: str(search.code_challenge_method),
    scope: str(search.scope),
    resource: str(search.resource),
  }),
  head: () => ({
    meta: [
      { title: "Allow Claude — Agent Control" },
      {
        name: "description",
        content:
          "Let Claude ask Agent Control before a send. You stay the customer of record. You keep the keys.",
      },
      { name: "theme-color", content: "#eef3f8" },
    ],
  }),
});

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function AuthorizePage() {
  const search = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const agentsQuery = useQuery({
    queryKey: ["oauth-consent-agents"],
    queryFn: () => listConsentAgents(),
    enabled: Boolean(user) && !isPending,
    retry: false,
  });

  const callbackURL = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (typeof value === "string" && value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/oauth/authorize?${qs}` : "/oauth/authorize";
  }, [search]);

  if (isPending) {
    return (
      <main className="sky grid min-h-screen place-items-center bg-bg px-5 py-10">
        <p className="text-body text-muted">Loading…</p>
      </main>
    );
  }

  if (!user) {
    const href = `${SIGN_IN_PATH}?callbackURL=${encodeURIComponent(callbackURL)}`;
    return (
      <main className="sky grid min-h-screen place-items-center bg-bg px-5 py-10">
        <div className="w-full max-w-md rounded-[28px] border border-border bg-surface p-8 shadow-[var(--shadow-panel)]">
          <Logo href="/" markClassName="text-navy" />
          <h1 className="mt-6 text-display font-semibold">{CONSENT_HEADLINE}</h1>
          <p className="mt-4 text-card text-muted">{CONSENT_LEDE}</p>
          <p className="mt-3 text-body text-muted">{CONSENT_SIGN_IN}</p>
          <Button asChild className="mt-6 w-full rounded-full">
            <a href={href}>Sign in</a>
          </Button>
        </div>
      </main>
    );
  }

  const agents = agentsQuery.data?.agents ?? [];
  const loadError = agentsQuery.error;
  const unauthorized = loadError instanceof Error && loadError.message === "Unauthorized";

  if (unauthorized) {
    const href = `${SIGN_IN_PATH}?callbackURL=${encodeURIComponent(callbackURL)}`;
    return (
      <main className="sky grid min-h-screen place-items-center bg-bg px-5 py-10">
        <p className="text-body text-muted">
          <a href={href} className="font-medium text-navy hover:text-coral">
            {CONSENT_SIGN_IN}
          </a>
        </p>
      </main>
    );
  }

  return (
    <main className="sky grid min-h-screen place-items-center bg-bg px-5 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-border bg-surface p-8 shadow-[var(--shadow-panel)]">
        <Logo href="/" markClassName="text-navy" />
        <p className="mt-6 text-meta font-medium uppercase tracking-[0.18em] text-coral">
          {CONSENT_EYEBROW}
        </p>
        <h1 className="mt-3 text-display font-semibold">{CONSENT_HEADLINE}</h1>
        <p className="mt-4 max-w-[46ch] text-card text-muted">{CONSENT_LEDE}</p>
        <p className="mt-3 text-body text-muted">{CONSENT_HUMAN_LINE}</p>
        <h2 className="mt-6 text-title font-semibold tracking-tight">{CONSENT_WHAT_HEADING}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-body text-muted">
          {CONSENT_WHAT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-4 text-body text-muted">{CONSENT_KEYS}</p>

        <form method="post" className="mt-8 space-y-4">
          {hiddenFields(search)}
          {agents.length === 0 ? (
            <p className="text-body text-muted">
              {CONSENT_NO_AGENTS}{" "}
              <a href="/dashboard" className="font-medium text-navy hover:text-coral">
                Open dashboard
              </a>
            </p>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-body font-medium text-fg">{CONSENT_PICK_AGENT}</span>
              <select
                name="agent_id"
                required
                className="h-11 w-full rounded-full border border-border bg-white px-4 text-body text-fg"
                defaultValue={agents[0]?.id}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.is_demo ? " (demo)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              name="decision"
              value="allow"
              className="rounded-full"
              disabled={agents.length === 0}
            >
              {CONSENT_ALLOW}
            </Button>
            <Button type="submit" name="decision" value="deny" variant="secondary" className="rounded-full">
              {CONSENT_DENY}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function hiddenFields(search: AuthorizeSearch) {
  const keys: Array<keyof AuthorizeSearch> = [
    "response_type",
    "client_id",
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "scope",
    "resource",
  ];
  return keys.map((key) =>
    search[key] ? <input key={key} type="hidden" name={key} value={search[key]} /> : null,
  );
}
