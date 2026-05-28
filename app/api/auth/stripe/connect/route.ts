import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOAuthState } from "@/lib/oauth-state";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/stripe/connect
 *
 * Entry point for the Stripe Connect OAuth flow. Builds an authorize URL
 * scoped to the platform's STRIPE_CLIENT_ID and 302-redirects the caller
 * to Stripe. After the merchant approves, Stripe will land them on
 * /api/auth/stripe/callback with `?code=...&state=...`.
 *
 * Returns the URL as JSON (instead of issuing a 302) when called with
 * `?json=1`, so the surcharge hub's "Connect Stripe" button can `window.open`
 * the URL in a new tab and detect popup blockers cleanly.
 *
 * The `state` parameter is an encrypted JWT-ish blob that pins the flow to
 * the calling auth user — see lib/oauth-state.ts.
 */
export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in before connecting Stripe." },
      { status: 401 }
    );
  }

  const clientId = process.env.STRIPE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "STRIPE_CLIENT_ID is not configured. Set it in Cloudflare Pages → " +
          "Environment Variables (find the ca_… value under Stripe Dashboard → " +
          "Settings → Connect → Onboarding options).",
      },
      { status: 500 }
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(req.url).origin;
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/auth/stripe/callback`;

  const state = await signOAuthState({
    authUserId: user.id,
    platform: "stripe",
  });

  const authorize = new URL("https://connect.stripe.com/oauth/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  // `read_write` lets us list customers and create invoice items, which is
  // the minimum Surcharge Hub needs. Drop to `read_only` if/when we add a
  // read-only inspection screen.
  authorize.searchParams.set("scope", "read_write");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  // Express onboarding is the lowest-friction path for the SMB users that
  // Profit Shield targets — Stripe runs the full KYC flow inline.
  authorize.searchParams.set("stripe_landing", "login");

  const url = authorize.toString();

  const reqUrl = new URL(req.url);
  if (reqUrl.searchParams.get("json") === "1") {
    return NextResponse.json({ url });
  }
  return NextResponse.redirect(url, { status: 302 });
}
