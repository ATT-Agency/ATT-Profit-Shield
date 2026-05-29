"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

function readCredentials(formData: FormData): { email: string; password: string } | string {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return "Email and password are required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return { email, password };
}

/**
 * Origin used to build absolute redirect URLs for Supabase email links.
 * Prefers NEXT_PUBLIC_SITE_URL (set per-environment in Cloudflare Pages)
 * and falls back to the inbound request's forwarded host so local dev and
 * preview deploys work without extra config.
 */
function getOrigin(): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (envOrigin) return envOrigin;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

/**
 * Upgrade the current anonymous session into a permanent email/password
 * account. Because we call updateUser on the existing session, auth.uid()
 * stays the same — all foreign-key rows (materials, expenses, forecasts)
 * remain attached to the same public.users row.
 *
 * If there is no current session (e.g. a logged-out visitor on /login),
 * we fall back to signUp so they still get an account. When email
 * confirmation is enabled in Supabase, signUp returns a user with no
 * session — we surface a "check your email" message instead of redirecting.
 */
export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = readCredentials(formData);
  if (typeof parsed === "string") return { error: parsed };

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const origin = getOrigin();
  const emailRedirectTo = `${origin}/auth/callback?next=/`;

  if (user?.is_anonymous) {
    const { data: updated, error } = await supabase.auth.updateUser(
      { email: parsed.email, password: parsed.password },
      { emailRedirectTo }
    );
    if (error) return { error: error.message };

    // With "Confirm email" OFF, Supabase flips is_anonymous to false right
    // away — land the user on the dashboard. With it ON, the session stays
    // anonymous (their existing materials/expenses keep working) until they
    // click the link, so we tell them to check their inbox.
    if (updated.user && updated.user.is_anonymous === false) {
      revalidatePath("/", "layout");
      redirect("/");
    }

    revalidatePath("/", "layout");
    return {
      message:
        "Check your email to confirm your new account. Your tracked data stays on this device until you do."
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: { emailRedirectTo }
  });
  if (error) return { error: error.message };

  // Supabase returns a user with an empty identities array when the email
  // is already registered (so we don't leak account existence). Surface a
  // generic hint rather than silently succeeding.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: "An account with this email already exists. Try signing in instead." };
  }

  // user.identities present but no session → email confirmation is on and
  // the user hasn't clicked the link yet.
  if (data.user && !data.session) {
    return { message: "Check your email to verify your account before signing in." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = readCredentials(formData);
  if (typeof parsed === "string") return { error: parsed };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Send a password-reset email. The link Supabase emails lands on
 * /auth/callback with a one-time code (or token_hash, depending on the
 * project's email template), which we exchange and then route the user
 * to /update-password to enter a new password.
 */
export async function resetPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };

  const supabase = createSupabaseServerClient();
  const origin = getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/update-password`
  });
  if (error) return { error: error.message };

  return {
    message: "If an account exists for that email, a reset link is on its way."
  };
}

/**
 * Finalize a password reset. /auth/callback exchanges the code from the
 * recovery link into a session before the user reaches this action, so
 * updateUser runs against an authenticated, non-anonymous session.
 */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!password || !confirm) return { error: "Please fill in both fields." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return {
      error: "Your reset link is invalid or has expired. Request a new one."
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}
