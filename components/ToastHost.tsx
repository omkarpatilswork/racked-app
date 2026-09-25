"use client";

import { useEffect, useState } from "react";
import { subscribeToast } from "@/lib/toast";

export default function ToastHost() {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    return subscribeToast((text) => {
      const id = Date.now() + Math.random();
      setMessages((m) => [...m, { id, text }]);
      setTimeout(() => {
        setMessages((m) => m.filter((x) => x.id !== id));
      }, 2400);
    });
  }, []);

  if (!messages.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "96px",
        transform: "translateX(-50%)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className="animate-slide-up"
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            padding: "10px 16px",
            borderRadius: 999,
            fontSize: 13.5,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,.25)",
            whiteSpace: "nowrap",
          }}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
