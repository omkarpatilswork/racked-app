"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import CreateHub from "@/components/create/CreateHub";
import { openCreate } from "@/lib/feed";

// Home · Ranks · + · Rewards · You. The + opens posting (post, transformation,
// pump check) and "log a set" with all 10 machines (components/create).
const TABS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/leaderboard", label: "Ranks", icon: "trophy" },
  { href: "/rewards", label: "Rewards", icon: "gift" },
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
    pathname.startsWith("/rnr") ||
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

  const link = (tab: (typeof TABS)[number]) => {
    const active =
      tab.href === "/home"
        ? pathname === "/home" || pathname.startsWith("/machines") || pathname.startsWith("/machine/")
        : tab.href === "/profile"
          ? pathname.startsWith("/profile") || pathname.startsWith("/settings")
          : pathname.startsWith(tab.href);
    return (
      <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}>
        <Icon name={tab.icon} />
        {tab.label}
      </Link>
    );
  };

  return (
    <>
      <nav className="bottom-nav" aria-label="Main">
        {link(TABS[0])}
        {link(TABS[1])}
        <button type="button" className="nav-plus" onClick={() => openCreate("menu")} aria-label="Create: post, photo, transformation, pump check or log a set" data-testid="nav-plus">
          <span>
            <Icon name="plus" />
          </span>
        </button>
        {link(TABS[2])}
        {link(TABS[3])}
      </nav>
      <CreateHub />
    </>
  );
}
