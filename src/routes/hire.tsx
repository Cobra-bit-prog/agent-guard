import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/hire")({
  component: HireLayout,
});

function HireLayout() {
  return <Outlet />;
}
