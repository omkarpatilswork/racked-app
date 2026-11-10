import Landing from "@/components/landing/Landing";

// The public landing page. Signed-in members are sent to /home (the app)
// by middleware before this renders; /about shows the same page to anyone.
export default function LandingPage() {
  return <Landing redirectMembers />;
}
