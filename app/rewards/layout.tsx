import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rewards",
  description: "Earn XP for every set, finish weekly missions, keep your streak and win prizes from Racked's partner brands.",
};

export default function RewardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
