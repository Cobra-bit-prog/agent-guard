import { CopyCode } from "@/components/copy-code";
import { badgeAlt, badgeHtml, badgeMarkdown, badgePath } from "@/lib/directory/badge";

export function ListingBadgeShare({ id, featured }: { id: string; featured: boolean }) {
  const alt = badgeAlt(featured);
  return (
    <section className="mt-6 border-t border-border pt-4">
      <h2 className="text-body font-semibold text-fg">Show you're listed</h2>
      <p className="mt-1 text-body text-muted">
        Add this badge to your site or README so people can find you here.
      </p>
      <img className="mt-3" src={badgePath(id)} alt={alt} />
      <p className="mt-4 text-meta font-medium text-fg">Markdown</p>
      <CopyCode code={badgeMarkdown(id, featured)} />
      <p className="mt-3 text-meta font-medium text-fg">HTML</p>
      <CopyCode code={badgeHtml(id, featured)} />
    </section>
  );
}
