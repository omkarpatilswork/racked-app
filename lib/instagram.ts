// Instagram handle helpers. The same rules are enforced in the database
// (0008_instagram_handle.sql) -- this copy is for instant feedback in the UI
// and to make sure we only ever link to something that looks like a real handle.

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export function isValidHandle(h: string | null | undefined): h is string {
  return !!h && HANDLE_RE.test(h) && !h.includes("..") && !h.endsWith(".");
}

// "@Omi.fit" / "instagram.com/omi.fit/" / "https://www.instagram.com/omi.fit?igsh=x"
// -> "omi.fit". Empty input -> null (meaning "no handle"). Anything that
// cannot be a handle -> undefined.
export function cleanHandle(raw: string): string | null | undefined {
  let h = (raw || "").trim().toLowerCase();
  if (!h) return null;
  h = h.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, "");
  h = h.split("?")[0].split("#")[0].split("/")[0];
  h = h.replace(/^@+/, "");
  if (!h) return null;
  return isValidHandle(h) ? h : undefined;
}

export function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle}`;
}
