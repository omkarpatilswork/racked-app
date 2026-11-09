// Display-name rules, mirrored from update_my_profile() in
// supabase/migrations/0009_account_basics.sql so the form can say what's
// wrong before saving. The database is still the one that enforces them.
export function cleanDisplayName(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim().replace(/\s+/g, " ");
  if (v.length < 2 || v.length > 40) return { ok: false, error: "Use 2 to 40 characters." };
  if (/[@<>]/.test(v)) return { ok: false, error: "Names can't contain @, < or >." };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return { ok: false, error: "That name has characters we can't show." };
  return { ok: true, value: v };
}
