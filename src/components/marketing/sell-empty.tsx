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
    <div className="empty-board sell-empty mt-4">
      <p className="sell-empty-title">{title}</p>
      <p className="sell-empty-body">{body}</p>
      <a href={primaryHref} className="sell-empty-primary">
        {primaryLabel}
      </a>
      <div className="sell-empty-paths">
        <a href={paidHref} className="sell-empty-path">
          {paidLabel}
        </a>
        <a href={hireHref} className="sell-empty-path">
          {hireLabel}
        </a>
      </div>
    </div>
  );
}
