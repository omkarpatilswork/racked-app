"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// A crisp, scannable QR code drawn as inline SVG (dark modules on white, with
// error correction so a little glare on the TV still scans).
export default function QrCode({ value, className, label }: { value: string; className?: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0d0d0a", light: "#ffffff" } })
      .then((s) => active && setSvg(s))
      .catch(() => active && setSvg(null));
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className={className} role="img" aria-label={label} data-testid="tv-qr" data-value={value}>
      {svg ? <div className="tv-qr-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="tv-qr-svg tv-qr-blank" />}
    </div>
  );
}
