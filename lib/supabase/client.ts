import { createBrowserClient } from "@supabase/ssr";

/**
 * Build a Supabase browser client. Returns null (with a console error)
 * if the required NEXT_PUBLIC_* env vars are missing from the build,
 * rather than throwing — that way a misconfigured deploy degrades to
 * "no auth" instead of a white-screen React unmount.
 *
 * NEXT_PUBLIC_* values are inlined at `next build` time, so missing
 * vars here mean the Cloudflare Pages build environment didn't have
 * them set. Fix in: Pages → Settings → Environment Variables.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "are missing from the build environment. The Supabase browser client " +
        "cannot be initialized. Add both in Cloudflare Pages → Settings → " +
        "Environment Variables (scope: Production, type: Plain text) and " +
        "redeploy so `next build` runs with them set."
    );
    return null;
  }
  return createBrowserClient(url, key);
}
