"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import Link from "next/link";

export default function SignInSheet({
  open,
  onClose,
  next,
  title = "Track every set, PB & streak",
}: {
  open: boolean;
  onClose: () => void;
  next?: string;
  title?: string;
}) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title={title} testId="signin-sheet">
      <p className="muted center" style={{ margin: "0 0 18px", fontSize: 14 }}>
        One tap with Google — no password. Your sets, personal bests and streak are saved to your account.
      </p>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signInWithGoogle(next);
          } finally {
            // the page navigates away to Google; if it didn't, let them retry
            setTimeout(() => setBusy(false), 4000);
          }
        }}
        style={{ background: "#fff", color: "#1f1f1f", border: "1px solid #dadce0" }}
      >
        <Icon name="google" />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={onClose}>
        Not now
      </button>
      <p className="faint center" style={{ fontSize: 12, margin: "14px 0 0" }}>
        By continuing you agree to how we handle your data —{" "}
        <Link href="/privacy" className="link" onClick={onClose}>
          privacy
        </Link>
        .
      </p>
    </Sheet>
  );
}
