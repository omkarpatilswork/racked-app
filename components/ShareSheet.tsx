"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { drawShareCard, type ShareCardData } from "@/lib/shareCard";
import { toast } from "@/lib/toast";

export default function ShareSheet({
  data,
  onClose,
}: {
  data: ShareCardData;
  onClose: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    drawShareCard(data).then((canvas) => {
      canvas.toBlob((blob) => {
        if (cancelled || !blob) return;
        blobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      }, "image/png");
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filename = `racked-${data.fileTag || "share"}.png`;

  async function shareToApp() {
    if (!blobRef.current) return;
    try {
      const file = new File([blobRef.current], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Racked × Bijlee", text: data.shareText || "" });
      } else if (navigator.share) {
        await navigator.share({ title: "Racked × Bijlee", text: data.shareText || "" });
      } else {
        toast('Use "Save Image" then share it from there');
      }
    } catch {
      /* share sheet dismissed by the user, or unsupported here -- not an error */
    }
  }

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet center">
        <div className="sheet-handle" />
        {previewUrl ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Share preview"
              style={{ width: "100%", maxWidth: 240, borderRadius: 20, margin: "0 auto", display: "block", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}
            />
          </div>
        ) : (
          <div className="skeleton" style={{ height: 320, borderRadius: 20, maxWidth: 240, margin: "0 auto" }} />
        )}
        <a
          className="btn btn-yellow"
          style={{ marginTop: 18, opacity: previewUrl ? 1 : 0.5, pointerEvents: previewUrl ? "auto" : "none" }}
          href={previewUrl ?? undefined}
          download={filename}
          onClick={() => toast("Saved 🎉")}
        >
          <Icon name="bolt" /> Save Image
        </a>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-outline" onClick={shareToApp}>
            Share to app…
          </button>
        </div>
        <p className="faint center" style={{ fontSize: 11.5, margin: "10px 0 0" }}>
          Save it, then post it to Instagram, WhatsApp or wherever you like — just like Strava.
        </p>
      </div>
    </div>
  );
}
