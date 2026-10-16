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
  const [failed, setFailed] = useState(false);
  const [canShareFile, setCanShareFile] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const filename = `racked-${data.fileTag || "share"}.png`;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    drawShareCard(data)
      .then((canvas) => {
        canvas.toBlob((blob) => {
          if (cancelled) return;
          if (!blob) {
            setFailed(true);
            return;
          }
          blobRef.current = blob;
          objectUrl = URL.createObjectURL(blob);
          try {
            const file = new File([blob], filename, { type: "image/png" });
            setCanShareFile(!!navigator.canShare && navigator.canShare({ files: [file] }));
          } catch {
            setCanShareFile(false);
          }
          setPreviewUrl(objectUrl);
        }, "image/png");
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const ready = !!previewUrl;

  return (
    <div
      className="sheet-backdrop"
      // Must sit above the full-screen "New Personal Best" celebration
      // overlay (z-index 60) -- at the shared sheet z-index of 50 this sheet
      // used to open *behind* it, so tapping Share on a PB looked like it did
      // nothing.
      style={{ zIndex: 70 }}
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
        ) : failed ? (
          <p className="muted" style={{ margin: "30px 0", fontSize: 13.5 }}>
            Couldn&rsquo;t build the share image on this device. Close this and try again.
          </p>
        ) : (
          <div className="skeleton" style={{ height: 320, borderRadius: 20, maxWidth: 240, margin: "0 auto" }} />
        )}

        {canShareFile ? (
          <button
            className="btn btn-yellow"
            style={{ marginTop: 18, opacity: ready ? 1 : 0.5, pointerEvents: ready ? "auto" : "none" }}
            onClick={shareToApp}
          >
            <Icon name="bolt" /> Share
          </button>
        ) : (
          <a
            className="btn btn-yellow"
            style={{ marginTop: 18, opacity: ready ? 1 : 0.5, pointerEvents: ready ? "auto" : "none" }}
            href={previewUrl ?? undefined}
            download={filename}
            onClick={() => toast("Saved 🎉")}
          >
            <Icon name="bolt" /> Save Image
          </a>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {canShareFile ? (
            <a
              className="btn btn-outline"
              style={{ opacity: ready ? 1 : 0.5, pointerEvents: ready ? "auto" : "none" }}
              href={previewUrl ?? undefined}
              download={filename}
            >
              Save Image
            </a>
          ) : (
            <button className="btn btn-outline" onClick={shareToApp} disabled={!ready}>
              Share to app…
            </button>
          )}
        </div>
        <p className="faint center" style={{ fontSize: 11.5, margin: "10px 0 0" }}>
          Save it, then post it to Instagram, WhatsApp or wherever you like — just like Strava.
        </p>
      </div>
    </div>
  );
}
