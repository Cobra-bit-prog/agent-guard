/**
 * Soft empty card for the job board and agent directory.
 * Free action first, then a paid path. Not a blank panel.
 */

type SellEmptyProps = {
  title: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  paidHref: string;
  paidLabel: string;
  hireHref: string;
  hireLabel: string;
};

export function SellEmpty({
  title,
  body,
  primaryHref,
  primaryLabel,
  paidHref,
  paidLabel,
  hireHref,
  hireLabel,
}: SellEmptyProps) {
  return (
    <div className="empty-board mt-4 max-w-[36rem]">
      <p className="text-body text-fg">{title}</p>
      <p className="mt-2 text-body text-muted">{body}</p>
      <div className="mt-4 flex flex-col items-start gap-3">
        <a
          href={primaryHref}
          className="rounded-full bg-primary px-5 py-2.5 text-body font-medium text-primary-fg"
        >
          {primaryLabel}
        </a>
        <a href={paidHref} className="font-medium text-coral">
          {paidLabel}
        </a>
        <a href={hireHref} className="font-medium text-coral">
          {hireLabel}
        </a>
      </div>
    </div>
  );
}
