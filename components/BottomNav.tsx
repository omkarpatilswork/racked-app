"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import clsx from "clsx";

const TABS = [
  { href: "/", label: "Home", icon: "home" as const },
  { href: "/machines", label: "Machines", icon: "grid" as const },
  { href: "/leaderboard", label: "Ranks", icon: "trophy" as const },
  { href: "/profile", label: "Profile", icon: "user" as const },
];

export default function BottomNav() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  // Show the nav on the main machine screen (what you land on after an NFC
  // tap: /machine/<id>) so Ranks/Profile/Home are always one tap away. Still
  // hide it on the deeper, focused sub-pages (guide/log/feedback) where the
  // full-width "back" flow matters more than cross-app navigation.
  const isMachineSubpage = segments[0] === "machine" && segments.length > 2;
  const hidden = pathname.startsWith("/admin") || isMachineSubpage;

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
