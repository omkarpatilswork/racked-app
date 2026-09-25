"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import clsx from "clsx";

// Chrome-free on machine/guide/log/feedback pages — matches the "only that
// machine's data shows" behavior from the artifact prototype (Round 2).
const CHROME_FREE_PREFIXES = ["/machine/"];

const TABS = [
  { href: "/", label: "Home", icon: "home" as const },
  { href: "/machines", label: "Machines", icon: "grid" as const },
  { href: "/leaderboard", label: "Ranks", icon: "trophy" as const },
  { href: "/profile", label: "Profile", icon: "user" as const },
];

export default function BottomNav() {
  const pathname = usePathname();
  const hidden =
    pathname.startsWith("/admin") ||
    CHROME_FREE_PREFIXES.some((p) => pathname.startsWith(p));

  if (hidden) return null;

  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
      >
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold"
              )}
              style={{ color: active ? "var(--yellow)" : "var(--ink-faint)" }}
            >
              <Icon name={tab.icon} className="icon" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
