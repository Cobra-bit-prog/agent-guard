import { createFileRoute, Navigate } from "@tanstack/react-router";
import { parsePartnerSlug } from "@/lib/partner";

type SignupSearch = { partner?: string };

export const Route = createFileRoute("/signup")({
  component: SignupRedirect,
  validateSearch: (search: Record<string, unknown>): SignupSearch => {
    const partner = parsePartnerSlug(search.partner);
    return partner ? { partner } : {};
  },
});

function SignupRedirect() {
  const { partner } = Route.useSearch();
  return (
    <Navigate to="/login" search={partner ? { mode: "signup", partner } : { mode: "signup" }} />
  );
}
