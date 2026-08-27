export const LOGO_PROPOSALS = [
  {
    id: "1",
    src: "/logos/01-node-shield.jpg",
    name: "Node Shield",
    use: "Marketing site and decks — shield + agent node wordmark",
  },
  {
    id: "2",
    src: "/logos/02-ag-icon.jpg",
    name: "AG App Icon",
    use: "Favicon, mobile, and compact sidebar mark",
  },
  {
    id: "3",
    src: "/logos/03-protocol-seal.jpg",
    name: "Protocol Seal",
    use: "Docs, API keys, and institutional lockup",
  },
  {
    id: "4",
    src: "/logos/04-navbar-lockup.jpg",
    name: "Navbar Lockup",
    use: "Dashboard header — mark + stacked name",
  },
  {
    id: "5",
    src: "/logos/05-stroke-a.jpg",
    name: "Stroke A",
    use: "Quiet letterform — Linear / Stripe restraint",
  },
] as const;

export function LogoGallery() {
  return (
    <section id="logos" className="border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-10 md:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          Brand proposals
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Five Agent Control marks
        </h2>
        <p className="mt-3 max-w-2xl text-muted">
          Same navy and electric-blue palette as the product. Pick a number and
          we’ll put it on the header, favicon, and dashboard.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {LOGO_PROPOSALS.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-[var(--radius-lg)] bg-bg ring-1 ring-border"
            >
              <img
                src={p.src}
                alt={`${p.id}. ${p.name}`}
                className="aspect-square w-full object-cover"
              />
              <div className="px-5 py-4">
                <p className="text-sm font-semibold">
                  {p.id} — {p.name}
                </p>
                <p className="mt-1 text-sm text-muted">{p.use}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
