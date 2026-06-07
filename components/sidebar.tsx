import Link from "next/link";
import { LogOut, Sparkles, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { COPY } from "@/lib/copy";
import { SidebarNav } from "@/components/sidebar-nav";

/**
 * Narrowed type for a permanent (email/password) account — guarantees
 * `email` is set so we don't have to non-null-assert it in JSX.
 */
type PermanentUser = User & { email: string };

function isPermanentUser(user: User | null): user is PermanentUser {
  return Boolean(user && !user.is_anonymous && user.email);
}

export async function Sidebar() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // A transient getUser failure (network blip, key rotation, etc.) used
    // to render the guest CTA silently — which looked like the sign-out
    // button "disappearing" mid-session. Log it so the cause is visible
    // in server logs; the UI still falls back to the guest CTA safely.
    console.error("[sidebar] getUser failed:", error.message);
  }
  const user = data.user;
  const permanent = isPermanentUser(user);

  return (
    <aside className="sticky top-0 h-screen w-[280px] shrink-0 border-r border-cocoa-700 bg-cocoa-950/80 backdrop-blur-xl hidden lg:flex flex-col">
      <div className="px-7 pt-8 pb-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="size-10 rounded-2xl bg-vibrant flex items-center justify-center text-cocoa-950 shadow-glow">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="font-display text-xl leading-none tracking-tight">{COPY.brand}</p>
            <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute mt-1">ATT Agency</p>
          </div>
        </Link>
      </div>

      <div className="hairline-divider mx-7" />

      <SidebarNav />

      <div className="m-4 rounded-2xl border border-cocoa-700 bg-cocoa-900 p-4">
        {permanent ? (
          <form action={signOut} className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cream-mute">
                Signed in
              </p>
              <p
                className="font-medium text-sm mt-1 truncate"
                title={user.email}
              >
                {user.email}
              </p>
            </div>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cream-mute">
                Guest session
              </p>
              <p className="font-display text-lg mt-1 leading-tight">
                Save your progress
              </p>
              <p className="text-xs text-cream-mute mt-1">
                Lock in your materials and forecasts before you clear this browser.
              </p>
            </div>
            <Link href="/login" className="block">
              <Button type="button" variant="primary" size="sm" className="w-full">
                <Sparkles className="size-4" />
                Sign up
              </Button>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
