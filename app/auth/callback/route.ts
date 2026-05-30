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

function safeNextPath(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function loginErrorRedirect(origin: string, message: string): NextResponse {
  return NextResponse.redirect(
    `${origin}/login?mode=signin&error=${encodeURIComponent(message)}`
  );
}

/**
 * Callback for every Supabase auth flow that hands the browser back a
 * one-time token: email verification, password recovery, magic links.
 *
 * Two URL shapes are possible depending on the project's email templates:
 *   - PKCE:                 /auth/callback?code=...&next=/...
 *   - OTP (token_hash):     /auth/callback?token_hash=...&type=...&next=/...
 *
 * We handle both. `next` is restricted to in-app paths to prevent
 * open redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return loginErrorRedirect(origin, error.message);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (tokenHash && rawType && ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType
    });
    if (error) {
      return loginErrorRedirect(origin, error.message);
    }
    // For recovery, force /update-password regardless of ?next= so the
    // new session is consumed by the password form instead of silently
    // logging the user into the dashboard.
    const dest = rawType === "recovery" ? "/update-password" : next;
    return NextResponse.redirect(`${origin}${dest}`);
  }

  return loginErrorRedirect(origin, "This sign-in link is invalid or has expired.");
}
