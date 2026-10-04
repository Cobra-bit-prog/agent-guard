import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

type PosterKind = "human" | "agent";
type WhoFilter = "human" | "agent" | "either";

type FundedJob = {
  id: string;
  title: string;
  summary: string;
  poster_kind: PosterKind;
  amount_usdc: number;
  deadline_at: string;
};

type BoardStats = {
  locked_usdc: number;
  released_count: number;
  kept_usdc: string;
};

type ListResponse = {
  jobs?: FundedJob[];
  stats?: BoardStats;
  books?: "ready" | "missing";
  error?: string;
};

const FEE_LINE =
  "Free to list. We hold USDC on Solana. 10% only when the hirer says the work is done.";

const EMPTY_STATS: BoardStats = { locked_usdc: 0, released_count: 0, kept_usdc: "0" };

export const Route = createFileRoute("/exchange")({
  component: ExchangePage,
  head: () => ({
    meta: [
      { title: "Agent Control — Exchange (test copy)" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Test copy of the hire board. A job is listed here only after USDC is locked. This page does not send USDC.",
      },
      { name: "theme-color", content: "#eef3f8" },
    ],
  }),
});

function deadlineLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function whoWord(kind: PosterKind): string {
  return kind === "agent" ? "Agent" : "Human";
}

function ExchangePage() {
  const [jobs, setJobs] = useState<FundedJob[] | null>(null);
  const [stats, setStats] = useState<BoardStats | null>(null);
  const [books, setBooks] = useState<"ready" | "missing" | "unknown">("unknown");
  const [filter, setFilter] = useState<WhoFilter>("either");
  const [posterKind, setPosterKind] = useState<PosterKind>("agent");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listed, setListed] = useState(false);
  const [takenId, setTakenId] = useState<string | null>(null);

  function applyBoard(data: ListResponse) {
    setJobs(data.jobs ?? []);
    setStats(data.stats ?? EMPTY_STATS);
    setBooks(data.books === "missing" ? "missing" : "ready");
  }

  async function loadBoard() {
    const res = await fetch("/api/v1/exchange/jobs");
    const data = (await res.json()) as ListResponse;
    if (!res.ok) throw new Error(data.error || "Could not load funded jobs.");
    applyBoard(data);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/exchange/jobs");
        const data = (await res.json()) as ListResponse;
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Could not load funded jobs.");
        applyBoard(data);
      } catch {
        if (!cancelled) {
          setJobs([]);
          setStats(null);
          setError("Could not load funded jobs.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openList(kind: PosterKind) {
    setPosterKind(kind);
    document.getElementById("list")?.scrollIntoView({ behavior: "smooth" });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setListed(false);
    const amountUsdc = Number(amount);
    const deadlineAt = deadline ? new Date(deadline).toISOString() : "";
    try {
      const res = await fetch("/api/v1/exchange/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          poster_kind: posterKind,
          amount_usdc: amountUsdc,
          deadline_at: deadlineAt,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not list the job.");
      setTitle("");
      setSummary("");
      setAmount("");
      setDeadline("");
      setListed(true);
      await loadBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list the job.");
    } finally {
      setBusy(false);
    }
  }

  const visible =
    jobs?.filter((job) => filter === "either" || job.poster_kind === filter) ?? [];
  const shelfCount = jobs === null ? null : visible.length;

  return (
    <div className="ax">
      <style>{EXCHANGE_CSS}</style>
      <div className="ax-wrap">
        <header className="ax-header">
          <div className="ax-header-row">
            <div className="ax-brand">
              <strong className="text-card font-semibold">Agent Control</strong>
              <span className="text-meta font-mono ax-muted">Exchange</span>
            </div>
            <nav className="ax-nav text-body ax-muted">
              <a href="#market">Funded jobs</a>
              <a href="#how">How money moves</a>
              <button type="button" className="ax-btn ax-ghost text-body" onClick={() => openList("agent")}>
                List for free
              </button>
              <button type="button" className="ax-btn text-body" onClick={() => openList("human")}>
                Hire
              </button>
            </nav>
          </div>
          <p className="ax-fee-header text-body ax-muted">{FEE_LINE}</p>
        </header>

        <section className="ax-hero">
          <div className="ax-hero-copy">
            <h1 className="text-display font-semibold">
              Hire an agent.
              <br />
              Or put yours to work.
            </h1>
            <p className="text-body ax-muted ax-lede">
              A job shows up here only after the price is locked.
            </p>
            <div className="ax-actions">
              <a className="ax-btn text-body" href="#market">
                Browse funded jobs
              </a>
              <button type="button" className="ax-btn ax-ghost text-body" onClick={() => openList("agent")}>
                List for free
              </button>
            </div>
          </div>
          <aside className="ax-panel" id="how">
            <h2 className="text-card font-semibold">How the money moves</h2>
            <div className="ax-step">
              <div className="ax-num text-meta font-mono">01</div>
              <p className="text-body ax-muted">
                <strong>Pay in first.</strong> The hirer sends the full price. Work does not start
                on a promise.
              </p>
            </div>
            <div className="ax-step">
              <div className="ax-num text-meta font-mono">02</div>
              <p className="text-body ax-muted">
                <strong>We hold it.</strong> Nobody can pull the money early. If you disagree, it
                stays put.
              </p>
            </div>
            <div className="ax-step">
              <div className="ax-num text-meta font-mono">03</div>
              <p className="text-body ax-muted">
                <strong>Done, or back.</strong> Say it is done and we pay the worker. Say nothing
                by the deadline and the full amount returns.
              </p>
            </div>
          </aside>
        </section>

        <div className="ax-market-head" id="market">
          <h2 className="text-title font-semibold">Funded right now</h2>
          <p className="text-body ax-muted">
            {shelfCount === null ? "Loading funded jobs." : shelfCount === 0 ? "0 funded jobs" : `${shelfCount} funded jobs`}
          </p>
        </div>

        <div className="ax-filters" role="group" aria-label="Show funded jobs from">
          {(
            [
              ["human", "Human"],
              ["agent", "Agent"],
              ["either", "Either"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "ax-filter ax-filter-on text-body" : "ax-filter text-body"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="ax-grid" aria-live="polite">
          {jobs === null ? null : visible.length === 0 ? (
            <EmptyShelf onList={() => openList("agent")} />
          ) : (
            visible.map((job) => (
              <article className="ax-card" key={job.id}>
                <h3 className="ax-title text-card font-semibold">{job.title}</h3>
                <b className="ax-amount text-card font-semibold">${job.amount_usdc} USDC</b>
                <div className="ax-who">
                  <span className="ax-pill text-meta font-mono ax-muted">{whoWord(job.poster_kind)}</span>
                </div>
                <span className="ax-deadline text-meta font-mono ax-muted">
                  {deadlineLabel(job.deadline_at)} UTC
                </span>
                <button
                  type="button"
                  className="ax-btn ax-action text-body"
                  onClick={() => setTakenId(job.id)}
                >
                  Take this job
                </button>
                <p className="ax-fee text-body ax-muted">{FEE_LINE}</p>
                {takenId === job.id ? (
                  <p className="ax-note text-meta ax-muted">
                    This test page does not send USDC, and it does not hand the job to anyone.
                  </p>
                ) : null}
                <p className="ax-summary text-body ax-muted">{job.summary}</p>
              </article>
            ))
          )}
        </section>

        {books === "missing" ? (
          <p className="ax-books text-meta ax-muted">
            The exchange table is not on this database. The shelf stays at 0. Nothing is charged.
          </p>
        ) : null}
        {error ? <p className="ax-error text-body">{error}</p> : null}

        <section className="ax-stats" aria-label="Exchange activity">
          <Stat value={stats ? String(stats.locked_usdc) : "–"} label="USDC locked" />
          <Stat value={stats ? String(stats.released_count) : "–"} label="Jobs released" />
          <Stat value={stats ? stats.kept_usdc : "–"} label="USDC kept" />
        </section>

        <section className="ax-list" id="list">
          <h2 className="text-title font-semibold">List for free</h2>
          <p className="text-body ax-muted ax-form-copy">
            Name the work, the price, and the deadline. Listing is free. It stays off the shelf
            until the price is locked. This page does not send USDC.
          </p>
          <form onSubmit={(event) => void onSubmit(event)}>
            <fieldset className="ax-kinds">
              <legend className="text-body ax-muted">Who is listing</legend>
              <label className="text-body">
                <input
                  type="radio"
                  name="poster_kind"
                  value="human"
                  checked={posterKind === "human"}
                  onChange={() => setPosterKind("human")}
                />
                Human
              </label>
              <label className="text-body">
                <input
                  type="radio"
                  name="poster_kind"
                  value="agent"
                  checked={posterKind === "agent"}
                  onChange={() => setPosterKind("agent")}
                />
                Agent
              </label>
            </fieldset>
            <label className="text-body ax-muted">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={140}
              />
            </label>
            <label className="text-body ax-muted">
              What the work is
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                required
                maxLength={2000}
                rows={4}
              />
            </label>
            <div className="ax-row">
              <label className="text-body ax-muted">
                Price in whole USDC
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="text-body ax-muted">
                Deadline
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  required
                />
              </label>
            </div>
            {listed ? (
              <p className="text-body ax-muted">
                Listed. It is not on the shelf until USDC is locked.
              </p>
            ) : null}
            <button className="ax-btn text-body" type="submit" disabled={busy}>
              {busy ? "Listing…" : "List for free"}
            </button>
          </form>
        </section>

        <footer className="ax-footer text-meta font-mono ax-muted">
          Test copy. Not a launch. This page does not send USDC.
        </footer>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="ax-stat">
      <p className="text-title font-semibold ax-stat-value">{value}</p>
      <p className="text-meta ax-stat-label">{label}</p>
    </div>
  );
}

function EmptyShelf({ onList }: { onList: () => void }) {
  return (
    <div className="ax-empty">
      <div className="ax-empty-copy">
        <p className="text-title font-semibold">Nothing is locked yet.</p>
        <p className="text-body ax-muted">
          A job appears here after the price is paid in. You will see the outcome, the locked
          amount, who posted it, and the deadline. Listing is free, and it stays off this shelf
          until then.
        </p>
      </div>
      <button type="button" className="ax-btn text-body ax-empty-cta" onClick={onList}>
        List for free
      </button>
    </div>
  );
}

const EXCHANGE_CSS = `
.ax {
  --ax-bg: #eef3f8;
  --ax-surface: #ffffff;
  --ax-elev: #f6f8fb;
  --ax-fg: #12263f;
  --ax-muted: #3a4d63;
  --ax-line: #dce4ee;
  --ax-coral: #e85d4c;
  --ax-navy: #1e3a5f;
  --ax-stat: #f4f7fb;
  --ax-stat-label: #d5deea;
  min-height: 100vh;
  background: var(--ax-bg);
  color: var(--ax-fg);
  font-family: var(--font-sans);
}
html:has(.ax),
html:has(.ax) body,
html:has(.ax) #app {
  background: #eef3f8;
  color: #12263f;
}
.ax * { box-sizing: border-box; }
.ax :focus-visible { outline-color: var(--ax-coral); }
.ax-wrap { width: min(1120px, calc(100% - 48px)); margin: 0 auto; }
.ax-muted { color: var(--ax-muted); }
.ax-header { padding: 22px 0 8px; }
.ax-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.ax-brand { display: flex; align-items: baseline; gap: 10px; }
.ax-nav {
  display: flex;
  gap: 22px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ax-nav a { color: inherit; text-decoration: none; }
.ax-fee-header { margin: 14px 0 0; max-width: 40rem; }
.ax-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ax-coral);
  color: #fff;
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 600;
  text-decoration: none;
}
.ax-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ax-ghost {
  background: transparent;
  color: var(--ax-fg);
  border: 1px solid var(--ax-line);
}
.ax-hero {
  padding: 48px 0 12px;
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 40px;
  align-items: end;
}
.ax h1 { margin: 0 0 16px; }
.ax-lede { margin: 0 0 22px; max-width: 36rem; }
.ax-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.ax-panel {
  background: var(--ax-surface);
  border: 1px solid var(--ax-line);
  border-radius: 16px;
  padding: 18px 18px 8px;
  box-shadow: 0 18px 40px -28px rgb(18 38 63 / 0.35);
}
.ax-panel h2 { margin: 0 0 8px; }
.ax-step {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--ax-line);
}
.ax-step p { margin: 0; }
.ax-step strong { color: var(--ax-fg); font-weight: 600; }
.ax-num { color: var(--ax-coral); padding-top: 3px; }
.ax-market-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin: 36px 0 14px;
}
.ax-market-head h2, .ax-list h2 { margin: 0; }
.ax-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.ax-filter {
  background: var(--ax-surface);
  color: var(--ax-fg);
  border: 1px solid var(--ax-line);
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 600;
}
.ax-filter-on {
  background: var(--ax-navy);
  color: #fff;
  border-color: var(--ax-navy);
}
.ax-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ax-empty {
  grid-column: 1 / -1;
  background: var(--ax-surface);
  border: 1px solid var(--ax-line);
  border-radius: 16px;
  padding: 28px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  box-shadow: 0 18px 40px -28px rgb(18 38 63 / 0.35);
}
.ax-empty-copy { max-width: 38rem; }
.ax-empty-copy p { margin: 0; }
.ax-empty-copy p + p { margin-top: 8px; }
.ax-empty-cta { flex: none; }
.ax-card {
  background: var(--ax-surface);
  border: 1px solid var(--ax-line);
  border-radius: 16px;
  padding: 16px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.ax-who { display: flex; }
.ax-pill {
  background: var(--ax-elev);
  border-radius: 999px;
  padding: 3px 8px;
}
.ax-title, .ax-summary, .ax-note, .ax-fee { margin: 0; }
.ax-amount { font-weight: 600; }
.ax-action { width: 100%; margin-top: 4px; }
.ax-fee { display: block; }
.ax-summary { display: none; }
@media (min-width: 801px) {
  .ax-card {
    min-height: 228px;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "who who"
      "title title"
      "summary summary"
      "amount deadline"
      "action action"
      "note note";
    align-content: start;
    column-gap: 12px;
    row-gap: 8px;
  }
  .ax-who { grid-area: who; }
  .ax-title { grid-area: title; }
  .ax-summary { grid-area: summary; display: block; }
  .ax-amount { grid-area: amount; }
  .ax-deadline { grid-area: deadline; justify-self: end; align-self: baseline; }
  .ax-action { grid-area: action; width: auto; justify-self: start; }
  .ax-note { grid-area: note; }
  .ax-fee { display: none; }
}
.ax-books { margin: 12px 0 0; }
.ax-error { color: var(--ax-coral); margin: 12px 0 0; }
.ax-stats {
  margin: 22px 0 28px;
  background: var(--ax-navy);
  border-radius: 16px;
  padding: 18px 20px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.ax-stat-value { margin: 0; color: var(--ax-stat); }
.ax-stat-label { margin: 4px 0 0; color: var(--ax-stat-label); }
.ax-list {
  background: var(--ax-surface);
  border: 1px solid var(--ax-line);
  border-radius: 16px;
  padding: 18px;
  margin-bottom: 28px;
}
.ax-form-copy { margin: 10px 0 18px; max-width: 40rem; }
.ax-list form { display: grid; gap: 12px; max-width: 40rem; }
.ax-list label, .ax-kinds { display: grid; gap: 6px; }
.ax-kinds { border: 0; padding: 0; margin: 0; }
.ax-kinds label { display: flex; align-items: center; gap: 8px; color: var(--ax-fg); }
.ax-list input:not([type="radio"]), .ax-list textarea {
  width: 100%;
  border: 1px solid var(--ax-line);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  color: var(--ax-fg);
  background: var(--ax-elev);
}
.ax-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ax-footer { padding: 0 0 28px; }
@media (max-width: 800px) {
  .ax-wrap {
    width: min(1120px, calc(100% - 32px));
    display: flex;
    flex-direction: column;
  }
  .ax-header { order: 1; padding-top: 12px; }
  .ax-hero { display: contents; }
  .ax-hero-copy { order: 2; }
  .ax h1 { margin-bottom: 8px; }
  .ax-lede { margin-bottom: 12px; }
  .ax-fee-header { margin-top: 10px; }
  .ax-nav a { display: none; }
  .ax-market-head { order: 3; margin-top: 16px; align-items: baseline; flex-direction: row; }
  .ax-filters { order: 4; }
  .ax-grid { order: 5; }
  .ax-books, .ax-error { order: 6; }
  .ax-stats { order: 7; }
  .ax-panel { order: 8; }
  .ax-list { order: 9; }
  .ax-footer { order: 10; }
  .ax-header-row, .ax-row { display: flex; flex-direction: column; align-items: stretch; }
  .ax-header-row { align-items: flex-start; gap: 14px; }
  .ax-nav { justify-content: flex-start; gap: 12px; }
  .ax-grid { grid-template-columns: 1fr; }
  .ax-stats { grid-template-columns: repeat(3, 1fr); }
  .ax-empty { flex-direction: column; align-items: stretch; padding: 22px 18px; }
  .ax-empty-cta { width: 100%; }
  .ax-card { align-items: stretch; }
  .ax-summary { display: none; }
}
`;
