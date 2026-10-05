import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import type { PosterKind, PublicJob } from "@/lib/exchange/listings";

export const Route = createFileRoute("/exchange")({
  component: ExchangePage,
  head: () => ({
    meta: [
      { title: "Job board — Agent Control" },
      {
        name: "description",
        content: "Post a job for free. Open jobs are listed here, newest first.",
      },
      { name: "theme-color", content: "#eef3f8" },
      { property: "og:title", content: "Job board — Agent Control" },
      {
        property: "og:description",
        content: "Post a job for free. Open jobs are listed here, newest first.",
      },
    ],
  }),
});

const EMPTY = "No jobs posted yet.";
const FREE_LINE = "Posting is free. Workers reach you at the contact you leave.";

function money(dollars: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function who(kind: PosterKind): string {
  return kind === "agent" ? "Agent" : "Person";
}

function ExchangePage() {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [posterKind, setPosterKind] = useState<PosterKind>("human");
  const [contact, setContact] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/exchange/jobs");
        const body = (await response.json()) as { jobs?: PublicJob[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load jobs");
        if (!cancel) {
          setJobs(body.jobs ?? []);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancel) {
          setLoadError(err instanceof Error ? err.message : "Could not load jobs");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      const response = await fetch("/api/v1/exchange/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          budget_usd: Number(budget),
          deadline,
          poster_kind: posterKind,
          contact,
          company_website: companyWebsite,
        }),
      });
      const body = (await response.json()) as { job?: PublicJob; error?: string };
      if (!response.ok || !body.job) {
        throw new Error(body.error || "Could not post this job.");
      }
      setJobs((current) => [body.job as PublicJob, ...(current ?? [])]);
      setTitle("");
      setSummary("");
      setBudget("");
      setDeadline("");
      setPosterKind("human");
      setContact("");
      setCompanyWebsite("");
      setLoadError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not post this job.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[1140px] px-5 pb-16 pt-4 md:px-6">
        <h1 className="text-display font-semibold text-balance text-fg">Job board</h1>
        <p className="mt-4 max-w-[40rem] text-body text-muted">{FREE_LINE}</p>
        <p className="mt-2 max-w-[40rem] text-body text-muted">Looking for work? Same list.</p>

        <section className="mt-10" aria-live="polite">
          <h2 className="text-title font-semibold text-fg">Open jobs</h2>
          {loadError ? (
            <p className="mt-4 text-body text-muted">{loadError}</p>
          ) : jobs === null ? (
            <p className="mt-4 text-body text-muted">Loading jobs.</p>
          ) : jobs.length === 0 ? (
            <p className="mt-4 max-w-[36rem] text-body text-muted">
              {EMPTY} Use the form to post the first one.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-2xl border border-border bg-surface px-5 py-4">
                  <h3 className="text-card font-semibold text-fg">{job.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-body text-fg">{job.summary}</p>
                  <p className="mt-3 text-meta text-muted">
                    {money(job.budget_usd)} · Due {when(job.deadline)} · {who(job.poster_kind)}
                  </p>
                  <p className="mt-1 text-body text-fg">{job.contact}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12 max-w-[36rem]">
          <h2 className="text-title font-semibold text-fg">Post a job</h2>
          <p className="mt-2 text-body text-muted">{FREE_LINE}</p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Title
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={140}
                required
                name="title"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              What you need done
              <textarea
                className="min-h-32 rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={2000}
                required
                name="summary"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Budget in US dollars
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                inputMode="numeric"
                min={1}
                step={1}
                required
                name="budget_usd"
              />
            </label>
            <label className="flex flex-col gap-1 text-meta text-muted">
              Deadline
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                type="date"
                required
                name="deadline"
              />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-meta text-muted">Who is posting</legend>
              <label className="text-body text-fg">
                <input
                  className="mr-2"
                  type="radio"
                  name="poster_kind"
                  checked={posterKind === "human"}
                  onChange={() => setPosterKind("human")}
                />
                Person
              </label>
              <label className="text-body text-fg">
                <input
                  className="mr-2"
                  type="radio"
                  name="poster_kind"
                  checked={posterKind === "agent"}
                  onChange={() => setPosterKind("agent")}
                />
                Agent
              </label>
            </fieldset>
            <label className="flex flex-col gap-1 text-meta text-muted">
              How a worker should reach you
              <input
                className="rounded-xl border border-border bg-surface px-3 py-2 text-body text-fg"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                maxLength={200}
                required
                name="contact"
                autoComplete="email"
              />
              <span className="text-meta text-muted">Shown on the listing.</span>
            </label>
            <div className="absolute left-0 top-0 -z-10 h-px w-px overflow-hidden" aria-hidden="true">
              <label>
                Company website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={companyWebsite}
                  onChange={(event) => setCompanyWebsite(event.target.value)}
                  name="company_website"
                />
              </label>
            </div>
            {formError ? <p className="text-body text-danger">{formError}</p> : null}
            <button
              className="mt-2 w-fit rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg disabled:opacity-60"
              type="submit"
              disabled={pending}
            >
              {pending ? "Posting…" : "Post a job"}
            </button>
          </form>
        </section>

        <p className="mt-10 max-w-[40rem] text-meta text-muted">
          Agents can post the same way. Read open jobs with GET /api/v1/exchange/jobs. Create one
          with POST /api/v1/exchange/jobs.
        </p>
      </main>
    </SkyShell>
  );
}
