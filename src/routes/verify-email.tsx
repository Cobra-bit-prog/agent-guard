import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: VerifyEmail,
});

function VerifyEmail() {
  const { user, isPending } = useCurrentUserState();
  const { email: emailFromQuery } = Route.useSearch();
  const knownEmail = user?.primaryEmail ?? emailFromQuery ?? "";
  const [email, setEmail] = useState(knownEmail);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPending && user?.emailVerified) return <Navigate to="/dashboard" />;

  async function resend() {
    const to = email.trim();
    if (!to) {
      setError("Enter the email you signed up with.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email: to,
        callbackURL: "/dashboard",
      });
      if (err) throw new Error(err.message);
      setNotice("New link sent. It expires in one hour.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-surface p-8 shadow-[var(--shadow-panel)]">
        <Link to="/" className="inline-flex">
          <Logo />
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted">
          Confirm the address to open the dashboard. The link expires in one
          hour. Unconfirmed accounts cannot use the console.
        </p>
        <div className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="verify-email">Email</Label>
            <Input
              id="verify-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={Boolean(user?.primaryEmail)}
            />
          </div>
          {notice && <p className="text-sm text-success">{notice}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button className="w-full" disabled={busy} type="button" onClick={() => void resend()}>
            {busy ? "Sending…" : "Resend confirmation link"}
          </Button>
        </div>
        <p className="mt-6 text-xs text-subtle">
          Wrong account?{" "}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => void signOut("/login")}
          >
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}
