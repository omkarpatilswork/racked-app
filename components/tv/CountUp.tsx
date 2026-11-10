"use client";

import { useEffect, useRef, useState } from "react";

// Counts up from 0 to `value` when it appears, so big numbers land with a
// bit of drama on the TV. Jumps straight to the value for reduced motion.
export default function CountUp({ value, duration = 1400, format }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value <= 0) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const n = Math.round(shown);
  return <>{format ? format(n) : n.toLocaleString("en-US")}</>;
}
