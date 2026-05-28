import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOAuthState } from "@/lib/oauth-state";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/square/connect
 *
 * Builds the Square authorize URL and redirects (or, with `?json=1`, returns
 * it as JSON). Scopes are the minimum needed for the Surcharge Hub to
 * enumerate customers and post invoices on the merchant's behalf:
 *
 *   - MERCHANT_PROFILE_READ — used by /validate to confirm "your token works"
 *   - CUSTOMERS_READ        — list/search customers in the picker
 *   - ORDERS_WRITE          — create the surcharge order
 *   - INVOICES_WRITE        — create the draft invoice tied to that order
 *
 * Square accepts production tokens at connect.squareup.com and sandbox
 * tokens at connect.squareupsandbox.com. We pick the environment from
 * SQUARE_ENVIRONMENT so a single deploy can run against either.
 */

function squareAuthorizeBase(): string {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

const SCOPES = [
  "MERCHANT_PROFILE_READ",
  "CUSTOMERS_READ",
  "ORDERS_WRITE",
  "ORDERS_READ",
  "INVOICES_WRITE",
  "INVOICES_READ",
].join("+");

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in before connecting Square." },
      { status: 401 }
    );
  }

  const clientId = process.env.SQUARE_APPLICATION_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "SQUARE_APPLICATION_ID is not configured. Find it in the Square " +
          "Developer Dashboard → your application → Credentials.",
      },
      { status: 500 }
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(req.url).origin;
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/auth/square/callback`;

  const state = await signOAuthState({
    authUserId: user.id,
    platform: "square",
  });

  const authorize = new URL(`${squareAuthorizeBase()}/oauth2/authorize`);
  authorize.searchParams.set("client_id", clientId);
  // `session=false` tells Square to ignore an existing merchant session so
  // the user always sees the explicit grant screen — without this they may
  // silently re-issue a token under whatever account they last logged in as.
  authorize.searchParams.set("session", "false");
  authorize.searchParams.set("state", state);
  // redirect_uri is optional if a single one is configured in the dashboard,
  // but we set it explicitly so previews/staging deploys work side-by-side
  // with production once each is whitelisted.
  authorize.searchParams.set("redirect_uri", redirectUri);
  // Append scopes manually rather than via URLSearchParams: Square documents
  // them as a `+`-separated list and the `+` would otherwise be encoded.
  const url = `${authorize.toString()}&scope=${SCOPES}`;

  const reqUrl = new URL(req.url);
  if (reqUrl.searchParams.get("json") === "1") {
    return NextResponse.json({ url });
  }
  return NextResponse.redirect(url, { status: 302 });
}
