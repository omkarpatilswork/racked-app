import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import BottomNav from "@/components/BottomNav";
import ToastHost from "@/components/ToastHost";

// Loaded via a <link> tag below rather than next/font/google: next/font
// fetches the font files from Google at BUILD time, which fails in
// network-restricted build environments (sandboxes, some self-hosted CI
// runners with an egress allowlist). The <link> tag fetches at request time
// in the visitor's own browser instead, which works everywhere Google Fonts
// itself is reachable. Swap to next/font/google (see git history / the
// Racked Artifact prototype notes) if your build environment allows the
// fetch and you want self-hosted, layout-shift-free fonts.

// The whole app is behind client-side Google auth and reads live/realtime
// Supabase data, so there's no useful static HTML to precompute — and
// AuthProvider (below) creates a Supabase client on mount for every page,
// which needs real env vars. Forcing every route dynamic means the build
// never tries to prerender pages at build time (when those env vars may
// not be the real ones yet) and just renders them per-request instead.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Racked by Bijlee",
  description:
    "Tap a machine, see your history, log your set. An NFC-powered layer for gym equipment, by Bijlee.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E3421F" },
    { media: "(prefers-color-scheme: dark)", color: "#FF6A46" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- see note above on next/font/google vs <link> */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;800;900&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <div id="app">
            {children}
            <BottomNav />
          </div>
          <ToastHost />
        </AuthProvider>
      </body>
    </html>
  );
}
