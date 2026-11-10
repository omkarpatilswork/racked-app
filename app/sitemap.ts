import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public pages only. Set NEXT_PUBLIC_SITE_URL on Vercel once the real domain
// is live and these links follow it.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/join`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/machines`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
