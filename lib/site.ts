// Site-wide settings for the public landing page and link previews.
// Both can be changed on Vercel (Project → Settings → Environment
// Variables) without touching code, then redeploy:
//   NEXT_PUBLIC_SITE_URL  the real domain once you have it, e.g. https://racked.run
//   NEXT_PUBLIC_GYM_NAME  the gym's name as members know it, e.g. "Club360 Baner"
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://racked-app-liard.vercel.app").replace(/\/+$/, "");
export const GYM_NAME = (process.env.NEXT_PUBLIC_GYM_NAME || "").trim();

export const BIJLEE_URL = "https://www.bijlee.run";
export const BIJLEE_INSTAGRAM = "https://www.instagram.com/bijlee.run/";
export const BIJLEE_HANDLE = "@bijlee.run";

export const SITE_TITLE = "Racked by Bijlee — tap a machine, log your set, get on the board";
export const SITE_DESCRIPTION =
  "The gym app from Bijlee Run Club, Pune. No download: tap the Racked sticker on any machine, log your set in two taps, and climb the leaderboard on the gym TV.";

// Real Bijlee photos for the "Built by Bijlee Run Club" section. Put the
// files in public/landing/ and list them here; the section shows a photo
// strip only when this list has photos in it.
export const LANDING_PHOTOS: { src: string; alt: string }[] = [];
