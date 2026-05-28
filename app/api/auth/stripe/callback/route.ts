import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyOAuthState } from "@/lib/oauth-state";
import {
  resolveCaller,
  upsertEncryptedConnection,
} from "@/lib/platform-connections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/stripe/callback?code=...&state=...
 *
 * Stripe redirects here after the merchant approves the OAuth scope. We:
 *   1. Verify the encrypted `state` matches the still-logged-in caller.
 *   2. POST the auth code to https://connect.stripe.com/oauth/token with the
 *      platform's STRIPE_SECRET_KEY (NOT the SDK — this is the only call
 *      that uses the raw platform key, and it doesn't need the SDK at all).
 *   3. Encrypt the returned access + refresh tokens and persist them on
 *      public.platform_connections (RLS gates the upsert to the caller).
 *   4. Redirect back to /surcharge so the UI re-reads the connection state.
 *
 * Failure modes are surfaced via `?stripe_error=...` query strings on the
 * redirect target rather than a JSON error — the user is in their browser
 * here, not in our app's `fetch` layer.
 */

type StripeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  stripe_user_id?: string;
  scope?: string;
  livemode?: boolean;
  token_type?: string;
  stripe_publishable_key?: string;
  error?: string;
  error_description?: string;
};

function appBase(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

function redirectWithError(req: Request, message: string): NextResponse {
  const target = new URL(`${appBase(req)}/surcharge`);
  target.searchParams.set("stripe_error", message);
  return NextResponse.redirect(target.toString(), { status: 302 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (oauthError) {
    return redirectWithError(req, oauthError);
  }
  if (!code || !state) {
    return redirectWithError(req, "Stripe redirect was missing `code` or `state`.");
  }

  const supabase = createSupabaseServerClient();
  let caller: Awaited<ReturnType<typeof resolveCaller>>;
  try {
    caller = await resolveCaller(supabase);
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "Failed to resolve caller."
    );
  }
  if (!caller) {
    return redirectWithError(req, "Sign in before completing Stripe connect.");
  }

  try {
    await verifyOAuthState({
      state,
      expectedAuthUserId: caller.authUserId,
      expectedPlatform: "stripe",
    });
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "Invalid OAuth state."
    );
  }

  const platformKey = process.env.STRIPE_SECRET_KEY;
  if (!platformKey) {
    return redirectWithError(req, "STRIPE_SECRET_KEY not configured on platform.");
  }

  // Token exchange. We hit the raw endpoint instead of using the SDK because
  // the SDK's `oauth.token` helper expects a slightly different call shape
  // and the raw POST is one fewer dependency on the edge.
  let tokens: StripeTokenResponse;
  try {
    const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platformKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
      }).toString(),
    });
    tokens = (await tokenRes.json()) as StripeTokenResponse;
    if (!tokenRes.ok || tokens.error || !tokens.access_token || !tokens.stripe_user_id) {
      const msg =
        tokens.error_description ??
        tokens.error ??
        `Stripe token exchange failed with status ${tokenRes.status}`;
      return redirectWithError(req, msg);
    }
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "Stripe token exchange threw."
    );
  }

  try {
    await upsertEncryptedConnection(supabase, {
      internalUserId: caller.internalUserId,
      platform: "stripe",
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      stripeUserId: tokens.stripe_user_id!,
      scope: tokens.scope ?? null,
    });
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "Failed to persist Stripe connection."
    );
  }

  const success = new URL(`${appBase(req)}/surcharge`);
  success.searchParams.set("stripe_connected", "1");
  return NextResponse.redirect(success.toString(), { status: 302 });
}
