"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fetchSignedUrls } from "@/lib/data";

// Links are requested for an hour; re-request after 45 minutes so a feed left
// open on a phone never shows broken images.
const URL_SECONDS = 3600;
const REFRESH_AFTER_MS = 45 * 60 * 1000;

// Turns storage paths into image links. Returns a path -> url map that fills
// in as the links arrive; paths not in the map yet should show a placeholder.
export function useSignedUrls(
  supabase: SupabaseClient<Database>,
  paths: (string | null | undefined)[]
): Record<string, string> {
  const cache = useRef<Record<string, { url: string; at: number }>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = [...new Set(paths.filter(Boolean) as string[])].sort().join("|");

  useEffect(() => {
    if (!key) return;
    const wanted = key.split("|");
    const now = Date.now();
    const need = wanted.filter((p) => !cache.current[p] || now - cache.current[p].at > REFRESH_AFTER_MS);
    const snapshot = () => {
      const out: Record<string, string> = {};
      wanted.forEach((p) => {
        if (cache.current[p]) out[p] = cache.current[p].url;
      });
      return out;
    };
    if (need.length === 0) {
      setUrls(snapshot());
      return;
    }
    let cancelled = false;
    fetchSignedUrls(supabase, need, URL_SECONDS)
      .then((fresh) => {
        const at = Date.now();
        Object.entries(fresh).forEach(([p, url]) => {
          cache.current[p] = { url, at };
        });
        if (!cancelled) setUrls(snapshot());
      })
      .catch(() => {
        if (!cancelled) setUrls(snapshot());
      });
    return () => {
      cancelled = true;
    };
  }, [key, supabase]);

  return urls;
}
