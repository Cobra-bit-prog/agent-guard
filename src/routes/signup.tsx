import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/signup")({
  component: SignupRedirect,
});

function SignupRedirect() {
  return <Navigate to="/login" search={{ mode: "signup" }} />;
}
