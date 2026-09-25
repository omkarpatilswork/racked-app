import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google OAuth redirects here with a `code` param after the consent screen.
// Exchange it for a session, then bounce back to wherever the sign-in was
// triggered from (or home).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
