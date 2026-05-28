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
 * GET /api/auth/square/callback?code=...&state=...
 *
 * Mirrors the Stripe callback but talks to Square's token endpoint, which
 * has its own request shape: JSON body + the platform's
 * SQUARE_APPLICATION_SECRET in the body (NOT in an Authorization header).
 *
 * Square access tokens currently expire after 30 days and must be refreshed
 * with the refresh_token; we persist `expires_at` so a future cron can
 * pre-rotate before it expires.
 */

type SquareTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_at?: string;
  merchant_id?: string;
  refresh_token?: string;
  short_lived?: boolean;
  errors?: Array<{ category?: string; code?: string; detail?: string }>;
};

function squareBase(): string {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function appBase(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

function redirectWithError(req: Request, message: string): NextResponse {
  const target = new URL(`${appBase(req)}/surcharge`);
  target.searchParams.set("square_error", message);
  return NextResponse.redirect(target.toString(), { status: 302 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denyError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (denyError) {
    return redirectWithError(req, denyError);
  }
  if (!code || !state) {
    return redirectWithError(req, "Square redirect was missing `code` or `state`.");
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
    return redirectWithError(req, "Sign in before completing Square connect.");
  }

  try {
    await verifyOAuthState({
      state,
      expectedAuthUserId: caller.authUserId,
      expectedPlatform: "square",
    });
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "Invalid OAuth state."
    );
  }

  const clientId = process.env.SQUARE_APPLICATION_ID;
  const clientSecret = process.env.SQUARE_APPLICATION_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(
      req,
      "SQUARE_APPLICATION_ID and SQUARE_APPLICATION_SECRET must both be configured."
    );
  }

  let tokens: SquareTokenResponse;
  try {
    const tokenRes = await fetch(`${squareBase()}/oauth2/token`, {
      method: "POST",
      headers: {
        "Square-Version": "2025-09-24",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    tokens = (await tokenRes.json()) as SquareTokenResponse;
    if (
      !tokenRes.ok ||
      tokens.errors?.length ||
      !tokens.access_token ||
      !tokens.merchant_id
    ) {
      const msg =
        tokens.errors?.[0]?.detail ??
        tokens.errors?.[0]?.code ??
        `Square token exchange failed with status ${tokenRes.status}`;
      return redirectWithError(req, msg);
    }
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "Square token exchange threw."
    );
  }

  try {
    await upsertEncryptedConnection(supabase, {
      internalUserId: caller.internalUserId,
      platform: "square",
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      squareMerchantId: tokens.merchant_id!,
      tokenExpiresAt: tokens.expires_at ?? null,
    });
  } catch (err) {
    return redirectWithError(
      req,
      err instanceof Error ? err.message : "Failed to persist Square connection."
    );
  }

  const success = new URL(`${appBase(req)}/surcharge`);
  success.searchParams.set("square_connected", "1");
  return NextResponse.redirect(success.toString(), { status: 302 });
}
