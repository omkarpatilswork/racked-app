import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Racked: tap or scan, log, win",
  description: "The gym app with nothing to download. Tap or scan the sticker, log your set, climb the board and win weekly prizes from partner brands.",
  alternates: { canonical: "/" },
};

// The landing page at a link anyone can open, members included (it never
// redirects to /home like "/" does). Share this one: /landing, or jump to a
// section with /brands or /gyms.
export default function LandingPage() {
  return <Landing />;
}
