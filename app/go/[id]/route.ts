// /go/<brand>  — the link behind a partner's QR code on the gym TV.
// Counts the visit (as a TV scan, sponsor_clicks.source = 'tv', 0013), then
// sends the phone straight on to the brand's site, tagged
// utm_source=racked&utm_medium=tv so the brand sees it in their analytics.
// Anything odd (unknown brand, database not reachable) lands on the Partners
// tab of the Rewards page instead of an error.
//
//   /go/clean-crate?src=tv&p=5   p = the product shown on the TV (optional)
import { NextResponse, type NextRequest } from "next/server";
import { sponsorLink } from "@/lib/rewards";

export const dynamic = "force-dynamic";

async function lookUp(id: string, productId: number | null, source: "tv" | "app"): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const opts = { headers, cache: "no-store" as const, signal: AbortSignal.timeout(3500) };
  try {
    const r = await fetch(`${base}/rest/v1/rpc/track_sponsor_click`, {
      ...opts,
      method: "POST",
      body: JSON.stringify({ p_sponsor_id: id, p_product_id: productId, p_source: source }),
    });
    if (r.ok) {
      const v = await r.json().catch(() => null);
      return typeof v === "string" && v ? v : null;
    }
    if (r.status !== 404) return null;
    // database update 0013 not run yet: count it the old way, then find the site
    await fetch(`${base}/rest/v1/rpc/track_sponsor_click`, {
      ...opts,
      method: "POST",
      body: JSON.stringify({ p_sponsor_id: id, p_product_id: productId }),
    }).catch(() => null);
    const s = await fetch(`${base}/rest/v1/sponsors?id=eq.${encodeURIComponent(id)}&active=eq.true&select=website_url`, opts);
    if (!s.ok) return null;
    const rows = (await s.json().catch(() => [])) as { website_url: string | null }[];
    return rows?.[0]?.website_url || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = String(params.id || "").toLowerCase();
  const q = req.nextUrl.searchParams;
  const source = q.get("src") === "app" ? "app" : "tv";
  const productId = /^\d{1,12}$/.test(q.get("p") || "") ? Number(q.get("p")) : null;
  const fallback = new URL("/rewards?tab=partners", req.nextUrl.origin);

  const site = /^[a-z0-9][a-z0-9-]{1,39}$/.test(id) ? await lookUp(id, productId, source) : null;
  const dest = sponsorLink(site, productId ? `product-${productId}` : id, source);
  const res = NextResponse.redirect(dest ? new URL(dest) : fallback, 302);
  // never cached: every scan should reach us and be counted
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
