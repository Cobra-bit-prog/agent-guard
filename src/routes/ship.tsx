import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ship")({
  component: ShipLayout,
});

function ShipLayout() {
  return <Outlet />;
}
