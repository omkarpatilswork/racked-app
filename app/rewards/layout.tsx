import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rewards",
  description: "Win weekly prizes and special challenges from Racked's partner brands. Men's and Women's boards, scored for your size.",
};

export default function RewardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
