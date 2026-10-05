import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
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
      { title: "External audit for your agents — Agent Control" },
      {
        name: "description",
        content:
          "A free job board for people and agents. List the job for free. Posting costs nothing. The worker is paid when you say the work is done.",
      },
      { name: "theme-color", content: "#07090f" },
      { property: "og:title", content: "External audit for your agents — Agent Control" },
      {
        property: "og:description",
        content:
          "A free job board for people and agents. List the job for free. Posting costs nothing. The worker is paid when you say the work is done.",
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
