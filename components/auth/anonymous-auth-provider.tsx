"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Routes where the visitor is in the middle of an auth flow. We must NOT
 * mint an anonymous session on these pages because they're specifically
 * about signing in, signing out, or completing a server-side auth callback.
 */
const AUTH_FLOW_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/update-password",
]);

function isAuthFlowPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (AUTH_FLOW_PATHS.has(pathname)) return true;
  return pathname.startsWith("/auth/");
}

/**
 * Silent anonymous auth.
 *
 * On first mount, and only if no session exists and the visitor isn't
 * already in an auth flow, creates a Supabase anonymous user. Pairs with
 * the on_auth_user_created trigger in supabase/schema.sql, which inserts
 * a matching public.users row.
 *
 * Returning anonymous visitors keep their materials because the session
 * lives in cookies and is reused across visits on the same browser.
 * Clearing site data == losing the session (strict per-user RLS still
 * applies).
 */
export function AnonymousAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    // createSupabaseBrowserClient returns null (and logs) when the
    // NEXT_PUBLIC_SUPABASE_* env vars are missing from the build. Bail
    // silently rather than throwing into React's error boundary.
    if (!supabase) return;

    (async () => {
      // Don't bootstrap an anonymous session if the visitor is mid-flow
      // (e.g. about to sign in or complete a recovery callback).
      if (isAuthFlowPath(pathname)) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session || cancelled) return;

      const { error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error) {
        // Most common cause: Anonymous Sign-Ins is disabled in the
        // Supabase dashboard under Authentication → Providers. Enable
        // it there.
        console.error("[auth] anonymous sign-in failed:", error.message);
        return;
      }

      // Server components read auth from cookies(); they won't see the
      // new session until the next request. router.refresh() triggers
      // exactly that without losing client state.
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  return <>{children}</>;
}
