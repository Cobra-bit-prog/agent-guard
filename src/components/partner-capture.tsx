import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  parsePartnerSlug,
  partnerSlugFromSearchParams,
  readStoredPartnerSlug,
  storePartnerSlug,
} from "@/lib/partner";
import { persistPartnerSource } from "@/lib/server/partner";

/**
 * Captures `?partner=` on any public landing, stores first-touch locally, and
 * writes it to the principal once they authenticate — never overwrites.
 */
export function PartnerCapture() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const partnerParam = useRouterState({
    select: (s) => {
      const search = s.location.search as { partner?: unknown } | undefined;
      return typeof search?.partner === "string" ? search.partner : undefined;
    },
  });
  const { user, isPending } = useCurrentUserState();
  const persisted = useRef(false);

  useEffect(() => {
    const fromWindow =
      typeof window !== "undefined"
        ? partnerSlugFromSearchParams(window.location.search)
        : null;
    const fromState = parsePartnerSlug(partnerParam);
    const fromUrl = fromWindow ?? fromState;
    if (fromUrl) storePartnerSlug(fromUrl);
  }, [pathname, partnerParam]);

  useEffect(() => {
    if (isPending || !user || persisted.current) return;
    const slug = readStoredPartnerSlug();
    if (!slug) return;
    persisted.current = true;
    void persistPartnerSource({ data: { partner: slug } }).catch(() => {
      persisted.current = false;
    });
  }, [user, isPending]);

  return null;
}
