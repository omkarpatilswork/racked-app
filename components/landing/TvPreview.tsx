"use client";

import { useEffect, useRef, useState } from "react";
import BoltMark from "@/components/BoltMark";

// The real gym TV (/tv), running live inside a TV frame. It's only loaded
// when the section comes near the screen, and drawn at 1920×1080 then scaled
// down, so it looks exactly like the screen on the gym wall.
export default function TvPreview() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "700px 0px" }
    );
    io.observe(el);
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1920));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <figure className="lp-tvframe" data-testid="lp-tv">
      <div className="lp-tv-bezel">
        <div className="lp-tv-screen" ref={boxRef}>
          {show && scale > 0 ? (
            <iframe
              src="/tv?interval=6"
              title="The gym TV, live"
              aria-hidden="true"
              tabIndex={-1}
              width={1920}
              height={1080}
              style={{ transform: `scale(${scale})` }}
              data-testid="lp-tv-frame"
            />
          ) : (
            <div className="lp-tv-placeholder" aria-hidden="true">
              <BoltMark className="lp-tv-placeholder-bolt" />
            </div>
          )}
        </div>
      </div>
      <i className="lp-tv-stand" aria-hidden="true" />
      <figcaption>
        <i className="lp-live-dot" /> This is the gym TV, live, right now.
      </figcaption>
    </figure>
  );
}
