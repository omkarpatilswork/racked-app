"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import { useAuth } from "@/lib/auth-context";
import { useGym } from "@/lib/gym";
import { toast } from "@/lib/toast";
import { renderStory, storyBlob, storyCaption, storyFileName, type StoryData } from "@/lib/story";

// Share anything as an Instagram Story / WhatsApp Status image.
// "Card" = the designed poster; "On my photo" = the same info over a photo the
// member picks (a gym selfie). The phone's own share menu does the rest: a web
// page can't open Instagram's story editor directly, so Share hands the image
// to the phone, where Instagram (Story) and WhatsApp (Status / chat) appear.
export default function ShareStudio({ story, onClose, title = "Share" }: { story: StoryData; onClose: () => void; title?: string }) {
  const gym = useGym();
  const { profile } = useAuth();
  const who = (profile?.display_name || "").trim().split(/\s+/)[0] || null;
  const [style, setStyle] = useState<"card" | "photo">("card");
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [canShareFile, setCanShareFile] = useState(false);
  const blob = useRef<Blob | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const fileName = storyFileName(story);
  const caption = storyCaption(story, gym.name);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setBusy(true);
    setFailed(false);
    (async () => {
      try {
        const canvas = await renderStory({ data: story, gym, who, photo: style === "photo" ? photo : null });
        const b = await storyBlob(canvas);
        if (cancelled) return;
        if (!b) throw new Error("no image");
        blob.current = b;
        url = URL.createObjectURL(b);
        setPreview(url);
        try {
          const f = new File([b], fileName, { type: "image/png" });
          setCanShareFile(!!navigator.canShare && navigator.canShare({ files: [f] }));
        } catch {
          setCanShareFile(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // gym.loaded: redraw once the gym's logo / name arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, photo, gym.loaded, gym.logo, gym.logoDark, gym.name]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      setPhoto(bmp);
      setStyle("photo");
    } catch {
      toast("Couldn't open that photo. Try another one.");
    } finally {
      if (picker.current) picker.current.value = "";
    }
  }

  function choose(s: "card" | "photo") {
    if (s === "photo" && !photo) {
      picker.current?.click();
      return;
    }
    setStyle(s);
  }

  async function share() {
    if (!blob.current) return;
    const file = new File([blob.current], fileName, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
      } else if (navigator.share) {
        await navigator.share({ text: caption });
      } else {
        save();
      }
    } catch {
      /* closed the share menu: not an error */
    }
  }

  function save() {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Saved. Post it from your gallery.");
  }

  const ready = !!preview && !busy;

  return (
    <Sheet open onClose={onClose} title={title} testId="share-studio" layer={70} className="share-studio">
      <p className="faint center" style={{ margin: "-6px 0 12px", fontSize: 12.5 }}>
        Made for Instagram Stories &amp; WhatsApp Status
      </p>
      <div className="rw-tabs share-style" role="tablist" aria-label="Look" style={{ ["--n" as string]: 2, ["--i" as string]: style === "card" ? 0 : 1 }}>
        <span className="rw-tabs-glider" aria-hidden="true" />
        <button type="button" role="tab" aria-selected={style === "card"} className={style === "card" ? "on" : ""} onClick={() => choose("card")} data-testid="share-style-card">
          <Icon name="star" /> Card
        </button>
        <button type="button" role="tab" aria-selected={style === "photo"} className={style === "photo" ? "on" : ""} onClick={() => choose("photo")} data-testid="share-style-photo">
          <Icon name="camera" /> On my photo
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pickPhoto(e.target.files?.[0])}
        data-testid="share-photo-input"
        aria-label="Choose a photo"
      />

      <div className="share-preview" data-testid="share-preview" aria-busy={busy}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview of the image you'll share" className={busy ? "dim" : ""} />
        ) : failed ? (
          <p className="muted">Couldn&rsquo;t make the image on this device. Close this and try again.</p>
        ) : (
          <div className="skeleton" />
        )}
        {style === "photo" && photo && (
          <button type="button" className="share-change" onClick={() => picker.current?.click()}>
            <Icon name="camera" /> Change photo
          </button>
        )}
      </div>

      <button type="button" className="btn btn-yellow" onClick={canShareFile ? share : save} disabled={!ready} data-testid="share-go" style={{ marginTop: 14 }}>
        <Icon name={canShareFile ? "share" : "download"} /> {canShareFile ? "Share to Instagram / WhatsApp" : "Save image"}
      </button>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <a
          className="btn btn-ghost"
          href={`https://wa.me/?text=${encodeURIComponent(caption)}`}
          target="_blank"
          rel="noopener"
          data-testid="share-whatsapp"
        >
          <Icon name="msg" /> WhatsApp
        </a>
        {canShareFile ? (
          <button type="button" className="btn btn-ghost" onClick={save} disabled={!ready} data-testid="share-save">
            <Icon name="download" /> Save
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <p className="faint center" style={{ fontSize: 11.5, margin: "10px 0 0" }}>
        {canShareFile
          ? "Tap Share, then pick Instagram → Story, or WhatsApp → Status."
          : "Save the image, then post it from your gallery to your Instagram Story or WhatsApp Status."}
      </p>
    </Sheet>
  );
}
