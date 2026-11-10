import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "About Racked",
  alternates: { canonical: "/" },
};

// Same page as "/", but members can open it too (it never redirects).
export default function AboutPage() {
  return <Landing />;
}
