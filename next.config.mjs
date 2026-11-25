/** @type {import('next').NextConfig} */

// Security headers sent with every page. Kept deliberately compatible with
// Supabase (auth/storage on its own domain) and Google sign-in.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'" },
];

// One address for everything (Nov 2026, www.racked.site). Once
// NEXT_PUBLIC_SITE_URL is set on Vercel for Production (e.g.
// https://www.racked.site) and the site is redeployed, every *.vercel.app
// address of the live site sends people to the same page on the real domain
// (308, query kept, so the NFC stickers and QR codes printed with the old
// address still unlock their machine). Preview builds and local runs never
// redirect. Unset the variable and redeploy to turn it off.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
let siteHost = "";
try {
  siteHost = SITE_URL ? new URL(SITE_URL).hostname : "";
} catch {
  siteHost = "";
}
const toDomain = process.env.VERCEL_ENV === "production" && SITE_URL.startsWith("https://") && !!siteHost && !siteHost.endsWith(".vercel.app");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      ...(toDomain
        ? [{ source: "/:path*", has: [{ type: "host", value: ".*\\.vercel\\.app" }], destination: `${SITE_URL}/:path*`, permanent: true }]
        : []),
      // short, easy-to-say links for the team
      { source: "/staff", destination: "/admin", permanent: false },
      { source: "/rr", destination: "/rnr", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
