import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (bundled at build time from npm -- no request to
// Google Fonts, works in any build environment, no layout shift from a
// late-loading third-party stylesheet).
import "@fontsource-variable/unbounded";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import BottomNav from "@/components/BottomNav";
import ToastHost from "@/components/ToastHost";
import NetworkStatus from "@/components/NetworkStatus";
import OnboardingGate from "@/components/OnboardingGate";
import AppEffects from "@/components/AppEffects";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

// The whole app is behind client-side Google auth and reads live/realtime
// Supabase data, so there's no useful static HTML to precompute — and
// AuthProvider (below) creates a Supabase client on mount for every page,
// which needs real env vars. Forcing every route dynamic means the build
// never tries to prerender pages at build time (when those env vars may
// not be the real ones yet) and just renders them per-request instead.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Tap a gym machine, log your set, beat your PB. Racked turns your gym's equipment into a live, social training log — by Bijlee.";

export const metadata: Metadata = {
  title: { default: "Racked by Bijlee", template: "%s · Racked" },
  description: DESCRIPTION,
  applicationName: "Racked",
  appleWebApp: { capable: true, title: "Racked", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Racked by Bijlee",
    description: DESCRIPTION,
    type: "website",
    siteName: "Racked",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Sets light/dark before first paint so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AuthProvider>
          <OnboardingGate />
          <div id="app">
            <main id="main">{children}</main>
            <BottomNav />
          </div>
          <ToastHost />
          <NetworkStatus />
          <AppEffects />
        </AuthProvider>
      </body>
    </html>
  );
}
