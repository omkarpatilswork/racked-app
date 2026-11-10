import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts (bundled at build time from npm -- no request to
// Google Fonts, works in any build environment, no layout shift from a
// late-loading third-party stylesheet).
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import localFont from "next/font/local";
import { AuthProvider } from "@/lib/auth-context";
import BottomNav from "@/components/BottomNav";
import ToastHost from "@/components/ToastHost";
import NetworkStatus from "@/components/NetworkStatus";
import OnboardingGate from "@/components/OnboardingGate";
import AppEffects from "@/components/AppEffects";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";

// The whole app is behind client-side Google auth and reads live/realtime
// Supabase data, so there's no useful static HTML to precompute — and
// AuthProvider (below) creates a Supabase client on mount for every page,
// which needs real env vars. Forcing every route dynamic means the build
// never tries to prerender pages at build time (when those env vars may
// not be the real ones yet) and just renders them per-request instead.
export const dynamic = "force-dynamic";

// The display font (Unbounded) goes through next/font so it's preloaded with
// the page and gets a size-matched fallback: headlines appear in the right
// shape straight away instead of jumping when the font arrives.
const unbounded = localFont({
  src: "../node_modules/@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  variable: "--font-unbounded",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · Racked" },
  description: SITE_DESCRIPTION,
  applicationName: "Racked",
  appleWebApp: { capable: true, title: "Racked", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: "Racked by Bijlee",
    url: "/",
    locale: "en_IN",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Racked by Bijlee Run Club: Tap. Lift. Get on the board." }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
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
  themeColor: "#0d0d0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={unbounded.variable} suppressHydrationWarning>
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
