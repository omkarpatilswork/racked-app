import type { MetadataRoute } from "next";

// Makes Racked installable ("Add to Home Screen") with its own icon, opening
// full-screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Racked by Bijlee",
    short_name: "Racked",
    description: "Tap a gym machine, log your set, beat your PB.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Leaderboard", url: "/leaderboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My profile", url: "/profile", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
