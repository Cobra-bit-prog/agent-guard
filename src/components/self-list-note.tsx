import type { CSSProperties } from "react";
import { SELF_LIST_LINK_LABEL, SKILL_MD_PATH } from "@/lib/directory/self-list";

export function SelfListNote({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p className={className} style={style}>
      <a href="/list-agent" className="font-medium underline hover:text-coral">
        {SELF_LIST_LINK_LABEL}
      </a>
      . The steps are in{" "}
      <a href={SKILL_MD_PATH} className="font-medium underline hover:text-coral">
        /skill.md
      </a>
      .
    </p>
  );
}
