"use client";

import { useCallback, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import PhotoUploadSheet from "@/components/PhotoUploadSheet";
import PhotoViewer, { type ViewerPhoto } from "@/components/PhotoViewer";
import {
  deletePumpPhoto,
  reportPhotos,
  setPumpPhotoShared,
  uploadPumpPhoto,
  type PumpKind,
  type PumpPhoto,
} from "@/lib/data";
import { compressImage, newPhotoPath } from "@/lib/photos";
import { notifyPhotosChanged } from "@/lib/photoEvents";
import { todayStr } from "@/lib/streaks";
import { toast } from "@/lib/toast";

type Pending = { kind: PumpKind; day: string; replacing: boolean; file: File };
type ViewerState =
  | { mode: "own"; photo: ViewerPhoto }
  | { mode: "view"; photo: ViewerPhoto; title?: string; reportIds: number[] };

// One place that owns the whole "add / look at / change a pump photo" flow so
// the Home card, the Profile timeline and the feed behave identically.
//   pick(kind, day)   -> opens the camera / gallery, then the upload sheet
//   viewOwn(photo,url)-> full-screen view with share / replace / delete
//   viewOther(...)    -> full-screen view of someone else's photo, with Report
//   ui                -> render this once somewhere in the page
export function usePhotoManager(supabase: SupabaseClient<Database>, uid: string | null) {
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ kind: PumpKind; day: string; replacing: boolean } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const pick = useCallback((kind: PumpKind, day: string, replacing = false) => {
    target.current = { kind, day, replacing };
    const input = fileRef.current;
    if (input) {
      input.value = "";
      input.click();
    }
  }, []);

  const viewOwn = useCallback((photo: PumpPhoto, url: string | null) => {
    setViewer({ mode: "own", photo: { id: photo.id, kind: photo.kind, day: photo.day, shared: photo.shared, url } });
  }, []);

  const viewOther = useCallback(
    (photo: { id: number; kind: PumpKind; day: string; url: string | null }, opts: { title?: string; reportIds: number[] }) => {
      setViewer({
        mode: "view",
        photo: { id: photo.id, kind: photo.kind, day: photo.day, shared: true, url: photo.url },
        title: opts.title,
        reportIds: opts.reportIds,
      });
    },
    []
  );

  async function confirmUpload(shared: boolean) {
    if (!pending || !uid) return;
    try {
      const blob = await compressImage(pending.file);
      await uploadPumpPhoto(supabase, {
        uid,
        kind: pending.kind,
        blob,
        path: newPhotoPath(uid),
        shared,
        day: pending.day,
      });
      toast(shared ? "Posted to the gym feed" : "Saved to your progress");
      setPending(null);
      notifyPhotosChanged();
    } catch (err) {
      console.error(err);
      toast("Couldn't upload that photo — try again");
    }
  }

  async function toggleShare() {
    if (!viewer || viewer.mode !== "own") return;
    const next = !viewer.photo.shared;
    setViewer({ ...viewer, photo: { ...viewer.photo, shared: next } });
    try {
      await setPumpPhotoShared(supabase, viewer.photo.id, next);
      toast(next ? "Shared to the gym feed" : "Now only you can see it");
      notifyPhotosChanged();
    } catch {
      setViewer({ ...viewer, photo: { ...viewer.photo, shared: !next } });
      toast("Couldn't change that — try again");
    }
  }

  async function remove() {
    if (!viewer || viewer.mode !== "own") return;
    if (!confirm("Delete this photo? This can't be undone.")) return;
    try {
      await deletePumpPhoto(supabase, viewer.photo.id);
      setViewer(null);
      toast("Photo deleted");
      notifyPhotosChanged();
    } catch {
      toast("Couldn't delete — try again");
    }
  }

  async function report() {
    if (!viewer || viewer.mode !== "view") return;
    if (!confirm("Report this post? If a few members report it, it's hidden until the gym team reviews it.")) return;
    try {
      await reportPhotos(supabase, viewer.reportIds, "reported from feed");
      setViewer(null);
      toast("Reported — thanks for letting us know");
      notifyPhotosChanged();
    } catch {
      toast("Couldn't send the report — try again");
    }
  }

  const ui = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && target.current) setPending({ ...target.current, file });
        }}
      />
      {pending && (
        <PhotoUploadSheet
          kind={pending.kind}
          file={pending.file}
          replacing={pending.replacing}
          onCancel={() => setPending(null)}
          onConfirm={confirmUpload}
        />
      )}
      {viewer && (
        <PhotoViewer
          photo={viewer.photo}
          mode={viewer.mode}
          title={viewer.mode === "view" ? viewer.title : undefined}
          canReplace={viewer.mode === "own" && viewer.photo.day === todayStr()}
          onClose={() => setViewer(null)}
          onToggleShare={toggleShare}
          onDelete={remove}
          onReport={report}
          onReplace={() => {
            const { kind, day } = viewer.photo;
            setViewer(null);
            pick(kind, day, true);
          }}
        />
      )}
    </>
  );

  return { pick, viewOwn, viewOther, ui };
}
