"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = { error?: string } | undefined;

function readCredentials(formData: FormData): { email: string; password: string } | string {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return "Email and password are required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return { email, password };
}

/**
 * Upgrade the current anonymous session into a permanent email/password
 * account. Because we call updateUser on the existing session, auth.uid()
 * stays the same — all foreign-key rows (materials, expenses, forecasts)
 * remain attached to the same public.users row.
 *
 * If there is no current session (e.g. a logged-out visitor on /login),
 * we fall back to signUp so they still get an account.
 */
export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = readCredentials(formData);
  if (typeof parsed === "string") return { error: parsed };

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user?.is_anonymous) {
    const { error } = await supabase.auth.updateUser({
      email: parsed.email,
      password: parsed.password
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password
    });
    if (error) return { error: error.message };
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
