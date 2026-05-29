import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type EmailOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

const ALLOWED_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email"
]);

/**
 * Callback for every Supabase auth flow that hands the browser back a
 * one-time token: email verification, password recovery, magic links.
 *
 * Two URL shapes are possible depending on the project's email templates:
 *   - PKCE:        /auth/callback?code=...&next=/...
 *   - OTP (older): /auth/callback?token_hash=...&type=...&next=/...
 *
 * We handle both so the route works regardless of which template the
 * Supabase project ships with. `next` is restricted to in-app paths to
 * prevent open redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const nextParam = searchParams.get("next");

  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  const supabase = createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  if (tokenHash && rawType && ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType
    });
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
