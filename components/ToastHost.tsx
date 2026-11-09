"use client";

import { useEffect, useState } from "react";
import { subscribeToast } from "@/lib/toast";

export default function ToastHost() {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    return subscribeToast((text) => {
      const id = Date.now() + Math.random();
      setMessages((m) => [...m.slice(-2), { id, text }]);
      setTimeout(() => {
        setMessages((m) => m.filter((x) => x.id !== id));
      }, 2800);
    });
  }, []);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className="toast">
          {m.text}
        </div>
      ))}
    </div>
  );
}
