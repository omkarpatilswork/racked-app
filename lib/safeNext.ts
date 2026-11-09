// Where to send someone after sign-in or the welcome screens. Only ever a
// path inside this app: anything that would resolve to another site
// ("//evil.com", "/\t/evil.com", "https://...", "@evil.com") becomes "/".
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || typeof raw !== "string") return fallback;
  // control characters (tabs/newlines are stripped by URL parsing and can
  // turn "/\t/x" into "//x") and backslashes are never legitimate here
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  try {
    const base = "https://racked.invalid";
    const u = new URL(raw, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
