import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join Racked — get on the gym board",
  description: "Free, no app to download. Sign in with Google, tap any machine, log your set and see your best lift on the gym TV.",
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
