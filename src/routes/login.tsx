import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Google/X federate through Grok's preview OAuth client, which is not a
  // customer-facing login on Vercel. Public hosts use email/password.
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  const showBrokerSignIn =
    host.endsWith("grok-sandbox.com") ||
    host.endsWith(".grok.me") ||
    host === "localhost" ||
    host === "127.0.0.1";

  if (!isPending && user) return <Navigate to="/dashboard" />;

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          callbackURL: "/dashboard",
        });
        if (err) throw new Error(err.message);
        if (!data?.token) {
          setNotice("Check your inbox for a confirmation link. It expires in one hour.");
          return;
        }
      } else {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/dashboard",
        });
        if (err) {
          const code = (err as { code?: string }).code ?? "";
          const message = err.message ?? "";
          if (
            code === "EMAIL_NOT_VERIFIED" ||
            /not verified/i.test(message)
          ) {
            await authClient.sendVerificationEmail({
              email,
              callbackURL: "/dashboard",
            });
            setNotice("This account is not confirmed yet. We sent a new link to your inbox.");
            return;
          }
          throw new Error(err.message);
        }
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not authenticate");
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
          Sign in to Agent Guard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Protect the wallets your agents control.
        </p>

        {authEnabled ? (
          <>
            {showBrokerSignIn && (
              <>
                <div className="mt-6 space-y-2">
                  {GROK_PROVIDERS.map((p) => (
                    <Button
                      key={p.providerId}
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => signIn(p.providerId, { callbackURL: "/dashboard" })}
                    >
                      Continue with {p.label}
                    </Button>
                  ))}
                </div>
                <p className="my-5 text-center text-xs text-subtle">or email</p>
              </>
            )}
            <Tabs className={showBrokerSignIn ? undefined : "mt-6"} value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="signin">
                  Sign in
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="signup">
                  Create account
                </TabsTrigger>
              </TabsList>
              <TabsContent value={mode}>
                <form className="space-y-3" onSubmit={onEmail}>
                  {mode === "signup" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {mode === "signup" && (
                    <p className="text-xs text-muted">
                      We send a confirmation link to this address. Click it to
                      open the dashboard.
                    </p>
                  )}
                  {notice && <p className="text-sm text-success">{notice}</p>}
                  {error && <p className="text-sm text-danger">{error}</p>}
                  <Button className="w-full" disabled={busy}>
                    {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted">Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}
