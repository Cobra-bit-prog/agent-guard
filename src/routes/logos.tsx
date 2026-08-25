import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand";
import { LogoGallery } from "@/components/logo-gallery";

export const Route = createFileRoute("/logos")({ component: LogosPage });

function LogosPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <Link to="/" className="text-sm text-muted hover:text-fg">
          Back to product
        </Link>
      </header>
      <LogoGallery />
    </div>
  );
}
