import { NextResponse } from "next/server";
import { getStripeClientForTenant } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadDecryptedConnection,
  resolveCaller,
} from "@/lib/platform-connections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/validate
 *
 * Confirms the caller's stored Stripe OAuth token still works. Uses
 * `balance.retrieve()` because it's a single round-trip that proves both
 * auth and read access on the connected account, with no required arguments.
 */
export async function POST() {
  const supabase = createSupabaseServerClient();

  let caller: Awaited<ReturnType<typeof resolveCaller>>;
  try {
    caller = await resolveCaller(supabase);
  } catch (err) {
    return NextResponse.json(
      { connected: false, error: err instanceof Error ? err.message : "Auth failure" },
      { status: 200 }
    );
  }
  if (!caller) {
    return NextResponse.json(
      { connected: false, error: "Not signed in." },
      { status: 401 }
    );
  }

  let connection;
  try {
    connection = await loadDecryptedConnection({
      supabase,
      internalUserId: caller.internalUserId,
      platform: "stripe",
    });
  } catch (err) {
    return NextResponse.json(
      {
        connected: false,
        error: err instanceof Error ? err.message : "Stripe not connected.",
      },
      { status: 200 }
    );
  }

  try {
    const stripe = getStripeClientForTenant({
      mode: "oauth",
      accessToken: connection.accessToken,
      stripeUserId: connection.stripeUserId ?? undefined,
    });
    const balance = await stripe.balance.retrieve();
    const primaryCurrency =
      balance.available?.[0]?.currency?.toUpperCase() ?? "USD";
    return NextResponse.json({
      connected: true,
      accountName: `Stripe (${primaryCurrency})`,
      stripeUserId: connection.stripeUserId,
    });
  } catch (err: any) {
    // Mark the row as errored so the UI knows to nudge a reconnect.
    await supabase
      .from("platform_connections")
      .update({
        status: "error",
        error_message: err?.message ?? "Validation failed",
      })
      .eq("user_id", caller.internalUserId)
      .eq("platform", "stripe");
    return NextResponse.json(
      { connected: false, error: err?.message ?? "Stripe validation failed" },
      { status: 200 }
    );
  }
}
