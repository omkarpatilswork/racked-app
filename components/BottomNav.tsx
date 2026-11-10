"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

const TABS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/machines", label: "Machines", icon: "grid" },
  { href: "/leaderboard", label: "Ranks", icon: "trophy" },
  { href: "/profile", label: "You", icon: "user" },
] as const;

// Paths where the floating nav is hidden: the public landing page (/ and
// /about), focused flows (logging a set, guide, feedback), the welcome
// screens, staff tools and the gym TV.
export function navHidden(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const isMachineSubpage = segments[0] === "machine" && segments.length > 2;
  return (
    pathname === "/" ||
    pathname.startsWith("/about") ||
    isMachineSubpage ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/tv") ||
    pathname.startsWith("/welcome")
  );
}

export default function BottomNav() {
  const pathname = usePathname() || "/";
  const hidden = navHidden(pathname);

  useEffect(() => {
    document.body.classList.toggle("no-nav", hidden);
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab) => {
        const active =
          tab.href === "/home"
            ? pathname === "/home"
            : tab.href === "/machines"
              ? pathname.startsWith("/machines") || pathname.startsWith("/machine/")
              : tab.href === "/profile"
                ? pathname.startsWith("/profile") || pathname.startsWith("/settings")
                : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}>
            <Icon name={tab.icon} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
