import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "R&R Controls",
  robots: { index: false, follow: false },
};

export default function RrLayout({ children }: { children: React.ReactNode }) {
  return children;
}
