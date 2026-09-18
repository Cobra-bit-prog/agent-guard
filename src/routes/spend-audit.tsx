import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SkyShell } from "@/components/marketing/chrome";

export const Route = createFileRoute("/spend-audit")({
  component: () => (
    <SkyShell>
      <Outlet />
    </SkyShell>
  ),
});
