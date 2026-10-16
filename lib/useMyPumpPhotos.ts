"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fetchMyPumpPhotos, type PumpPhoto } from "@/lib/data";
import { onPhotosChanged } from "@/lib/photoEvents";

// "unavailable" = the database hasn't had 0007_pump_photos.sql applied yet.
// Callers hide the photo UI in that case instead of showing errors.
export type PhotosStatus = "loading" | "ready" | "unavailable";

export function useMyPumpPhotos(supabase: SupabaseClient<Database>, uid: string | null) {
  const [photos, setPhotos] = useState<PumpPhoto[]>([]);
  const [status, setStatus] = useState<PhotosStatus>("loading");

  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      setPhotos(await fetchMyPumpPhotos(supabase, uid));
      setStatus("ready");
    } catch {
      setStatus((s) => (s === "ready" ? s : "unavailable"));
    }
  }, [supabase, uid]);

  useEffect(() => {
    if (!uid) {
      setPhotos([]);
      setStatus("loading");
      return;
    }
    reload();
    return onPhotosChanged(reload);
  }, [uid, reload]);

  return { photos, status, reload };
}
