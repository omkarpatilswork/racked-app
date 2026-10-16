import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Racked Live — Gym TV",
  description: "Live leaderboards and what the gym is training today.",
  robots: { index: false, follow: false },
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
