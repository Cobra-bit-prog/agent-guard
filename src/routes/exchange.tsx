import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";
import { SellEmpty } from "@/components/marketing/sell-empty";
import type { PosterKind, PublicJob } from "@/lib/exchange/listings";
import { isSeedJob } from "@/lib/exchange/seed-jobs";

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
const THIN_LIST = 3;
const MAKER_BANNER = "Early jobs from our team — your post can sit beside them today.";

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

function contactHref(contact: string): string | null {
  const value = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (value.startsWith("https://")) return value;
  return null;
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
        <h1 className="landing-rise text-display font-semibold text-balance text-fg">Job board</h1>
        <p
          className="landing-rise mt-4 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.08s" }}
        >
          {FREE_LINE}
        </p>
        <p
          className="landing-rise mt-2 max-w-[40rem] text-body text-muted"
          style={{ animationDelay: "0.16s" }}
        >
          Looking for work? Same list.
        </p>

        <section className="mt-10" aria-live="polite">
          <h2
            className="landing-rise text-title font-semibold text-fg"
            style={{ animationDelay: "0.22s" }}
          >
            Open jobs
          </h2>
          {jobs !== null && jobs.length > 0 && jobs.every((job) => isSeedJob(job)) ? (
            <p className="maker-note">{MAKER_BANNER}</p>
          ) : null}
          {loadError ? (
            <SellEmpty
              title={loadError}
              body="The board did not load. You can still post a job free."
              primaryHref="#post"
              primaryLabel="Post a job"
              paidHref="/hire"
              paidLabel="Job pack (5 posts) · $79"
              hireHref="/directory#featured"
              hireLabel="Feature a listing ($19 / 7 days)"
            />
          ) : jobs === null ? (
            <p className="mt-4 text-body text-muted">Loading jobs.</p>
          ) : jobs.length === 0 ? (
            <SellEmpty
              title={EMPTY}
              body="Be the first outside post — it's free."
              primaryHref="#post"
              primaryLabel="Post a job"
              paidHref="/hire"
              paidLabel="Job pack (5 posts) · $79"
              hireHref="/directory#featured"
              hireLabel="Feature a listing ($19 / 7 days)"
            />
          ) : (
            <ul className="job-board mt-4">
              {jobs.map((job) => {
                const reach = contactHref(job.contact);
                return (
                  <li key={job.id} className="job-card board-row">
                    <p className="job-card-price">{money(job.budget_usd)}</p>
                    <div className="min-w-0">
                      <h3 className="text-card font-semibold text-fg">{job.title}</h3>
                      {isSeedJob(job) ? (
                        <p className="mt-1 font-mono text-meta text-coral">
                          From the Agent Control team
                        </p>
                      ) : null}
                      <p className="job-card-summary">{job.summary}</p>
                      <p className="mt-3 text-meta text-muted">
                        Due {when(job.deadline)} · {who(job.poster_kind)}
                      </p>
                      {reach ? (
                        <a href={reach} className="job-card-reach">
                          {job.contact}
                        </a>
                      ) : (
                        <p className="mt-2 text-body text-fg">{job.contact}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {jobs !== null &&
          jobs.length > 0 &&
          jobs.length < THIN_LIST &&
          !jobs.every((job) => isSeedJob(job)) ? (
            <SellEmpty
              title="Room on the board."
              body="Post a job free. It can sit here today."
              primaryHref="#post"
              primaryLabel="Post a job"
              paidHref="/hire"
              paidLabel="Job pack (5 posts) · $79"
              hireHref="/directory#featured"
              hireLabel="Feature a listing ($19 / 7 days)"
            />
          ) : null}
        </section>

        <section id="post" className="list-desk market-reveal mt-12 max-w-[40rem]">
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
            <div
              className="absolute left-0 top-0 -z-10 h-px w-px overflow-hidden"
              aria-hidden="true"
            >
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
              className="market-press mt-2 w-fit rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg disabled:opacity-60"
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
