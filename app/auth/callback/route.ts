import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * PKCE callback for Supabase auth flows that hand the browser a `?code=...`
 * to exchange for a session: email confirmation, password recovery,
 * magic links, and OAuth (Google / Microsoft / etc).
 *
 * `next` is an optional in-app path to land on after the exchange. We only
 * accept relative paths starting with "/" to prevent open redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
