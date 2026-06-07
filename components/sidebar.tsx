import { Suspense } from "react";
import Link from "next/link";
import { LogOut, Sparkles, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

/**
 * The Sidebar shell streams immediately (logo + nav). The auth card is
 * wrapped in a Suspense boundary so the Supabase session round-trip
 * doesn't gate first paint — and so we can show a skeleton in that
 * window instead of letting "Guest session" flash for signed-in users
 * on slow connections.
 */
export function Sidebar() {
  return (
    <aside className="sticky top-0 h-screen w-[280px] shrink-0 border-r border-cocoa-700 bg-cocoa-950/80 backdrop-blur-xl hidden lg:flex flex-col">
      <div className="px-7 pt-8 pb-6 shrink-0">
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

      <div className="hairline-divider mx-7 shrink-0" />

      {/*
        Scrollable middle band. `min-h-0` is required so this flex child
        can shrink below its content's intrinsic height on short
        viewports — without it, `overflow-y-auto` never engages and the
        auth card below gets pushed off-screen. The scrollbar is hidden
        across all browsers so the layout stays calm — scrolling still
        works via wheel, touch, and keyboard.
      */}
      <div
        className="
          flex-1 min-h-0 overflow-y-auto
          [scrollbar-width:none]
          [-ms-overflow-style:none]
          [&::-webkit-scrollbar]:hidden
        "
      >
        <SidebarNav />
      </div>

      <Suspense fallback={<AuthCardSkeleton />}>
        <AuthCard />
      </Suspense>
    </aside>
  );
}

async function AuthCard() {
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
    <div className="m-4 shrink-0 rounded-2xl border border-cocoa-700 bg-cocoa-900 p-4">
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
  );
}

/**
 * Fallback rendered while AuthCard awaits the Supabase session. Matches
 * the resolved card's footprint (border, padding, three stacked rows +
 * a button-shaped block) so there's no layout shift when it swaps in.
 */
function AuthCardSkeleton() {
  return (
    <div
      className="m-4 shrink-0 rounded-2xl border border-cocoa-700 bg-cocoa-900 p-4 space-y-3"
      aria-hidden="true"
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-24 rounded-md bg-cocoa-800/40" />
        <Skeleton className="h-5 w-40 rounded-lg" />
        <Skeleton className="h-3 w-48 rounded-md bg-cocoa-800/40" />
      </div>
      <Skeleton className="h-9 w-full rounded-xl" />
    </div>
  );
}
