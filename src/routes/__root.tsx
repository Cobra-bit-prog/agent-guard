import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { SITE_DOCUMENT_DESCRIPTION, SITE_DOCUMENT_TITLE } from "@/lib/site-title";
import { AuthProvider } from "@/lib/auth/provider";
import { PartnerCapture } from "@/components/partner-capture";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppProviders } from "@/components/providers";
import { Analytics } from "@vercel/analytics/react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_DOCUMENT_TITLE },
      {
        name: "description",
        content: SITE_DOCUMENT_DESCRIPTION,
      },
      { name: "theme-color", content: "#07090f" },
      { property: "og:title", content: SITE_DOCUMENT_TITLE },
      {
        property: "og:description",
        content: SITE_DOCUMENT_DESCRIPTION,
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg antialiased">
        <PreviewHostBridge />
        <AuthProvider>
          <AppProviders>
            <PartnerCapture />
            <Outlet />
          </AppProviders>
        </AuthProvider>
        <Scripts />
        <Analytics />
      </body>
    </html>
  ),
});
