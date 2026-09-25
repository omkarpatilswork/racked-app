"use client";

import { useAuth } from "@/lib/auth-context";
import Icon from "@/components/Icon";

export default function SignInSheet({
  open,
  onClose,
  next,
}: {
  open: boolean;
  onClose: () => void;
  next?: string;
}) {
  const { signInWithGoogle } = useAuth();
  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        className="card animate-slide-up"
        style={{
          width: "100%",
          maxWidth: 520,
          margin: "0 auto",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "var(--border)",
            margin: "0 auto 16px",
          }}
        />
        <div className="eyebrow" style={{ textAlign: "center" }}>
          Sign in to continue
        </div>
        <h2 style={{ textAlign: "center", margin: "6px 0 4px" }}>
          Track your sets, PBs & streaks
        </h2>
        <p className="faint center" style={{ margin: "0 0 20px", fontSize: 13.5 }}>
          One tap with Google — no password to remember.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => signInWithGoogle(next)}
          style={{ background: "#fff", color: "#1f1f1f", border: "1px solid var(--border)" }}
        >
          <Icon name="google" className="icon" />
          Continue with Google
        </button>
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={onClose}>
          Not now
        </button>
      </div>
    </div>
  );
}
