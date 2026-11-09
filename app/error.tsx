"use client";

import { useEffect } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

// Shown if a screen crashes. Keeps the rest of the app usable and offers a
// retry instead of a blank page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page stack-lg center" style={{ paddingTop: "18vh" }} role="alert">
      <div className="tapin-icons" style={{ margin: "0 auto", width: 60, height: 60, borderRadius: 20 }}>
        <Icon name="refresh" />
      </div>
      <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
      <p className="muted" style={{ margin: 0 }}>
        That screen hit a snag. Your logged sets are safe.
      </p>
      <div className="stack" style={{ maxWidth: 280, margin: "8px auto 0" }}>
        <button type="button" className="btn btn-yellow" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Go home
        </Link>
      </div>
    </div>
  );
}
