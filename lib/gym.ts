"use client";

// The gym Racked runs in (Club 360). Staff edit the name, location, logos and
// links in R&R Controls -> Gym (stored in rr_settings, 0012). Until that's run
// or loaded, everything falls back to the name below.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GYM_NAME } from "@/lib/site";

export type Gym = {
  name: string;
  location: string | null;
  logo: string | null; // for light backgrounds
  logoDark: string | null; // for dark backgrounds
  instagram: string | null;
  website: string | null;
  loaded: boolean;
};

export const DEFAULT_GYM: Gym = {
  name: GYM_NAME || "Club 360",
  location: null,
  logo: null,
  logoDark: null,
  instagram: null,
  website: null,
  loaded: false,
};

type Row = {
  gym_name: string;
  gym_location: string | null;
  gym_logo_url: string | null;
  gym_logo_dark_url: string | null;
  gym_instagram_url: string | null;
  gym_website_url: string | null;
};

let cache: Gym | null = null;
let pending: Promise<Gym> | null = null;
const listeners = new Set<(g: Gym) => void>();

export function gymFromRow(r: Partial<Row> | null | undefined): Gym {
  if (!r) return { ...DEFAULT_GYM, loaded: true };
  return {
    name: (r.gym_name || "").trim() || DEFAULT_GYM.name,
    location: r.gym_location || null,
    logo: r.gym_logo_url || null,
    logoDark: r.gym_logo_dark_url || null,
    instagram: r.gym_instagram_url || null,
    website: r.gym_website_url || null,
    loaded: true,
  };
}

export function loadGym(force = false): Promise<Gym> {
  if (cache && !force) return Promise.resolve(cache);
  if (pending && !force) return pending;
  const supabase = createClient() as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: number) => { maybeSingle: () => PromiseLike<{ data: Row | null; error: unknown }> } } };
  };
  pending = Promise.resolve(supabase.from("rr_settings").select("*").eq("id", 1).maybeSingle())
    .then(({ data, error }) => gymFromRow(error ? null : data))
    .catch(() => gymFromRow(null))
    .then((g) => {
      cache = g;
      pending = null;
      listeners.forEach((l) => l(g));
      return g;
    });
  return pending;
}

// After staff save new gym details in R&R Controls.
export function setGymCache(g: Gym) {
  cache = g;
  listeners.forEach((l) => l(g));
}

export function useGym(): Gym {
  const [gym, setGym] = useState<Gym>(cache || DEFAULT_GYM);
  useEffect(() => {
    listeners.add(setGym);
    loadGym().then(setGym);
    return () => {
      listeners.delete(setGym);
    };
  }, []);
  return gym;
}
