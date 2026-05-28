import { NextResponse } from "next/server";
import { createSquareClient, type SquareEnvironment } from "@/lib/square";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadDecryptedConnection,
  resolveCaller,
} from "@/lib/platform-connections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/square/validate
 *
 * Confirms the caller's stored Square OAuth token still works by listing
 * locations (the minimum-privilege "is your token good" call).
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
      platform: "square",
    });
  } catch (err) {
    return NextResponse.json(
      {
        connected: false,
        error: err instanceof Error ? err.message : "Square not connected.",
      },
      { status: 200 }
    );
  }

  try {
    const square = createSquareClient({
      accessToken: connection.accessToken,
      environment:
        (process.env.SQUARE_ENVIRONMENT as SquareEnvironment | undefined) ??
        "production",
    });
    const { accountName } = await square.validate();
    const locations = await square.listLocations();
    return NextResponse.json({
      connected: true,
      accountName,
      merchantId: connection.squareMerchantId,
      locations: locations.map((l) => ({ id: l.id, name: l.name })),
    });
  } catch (err: any) {
    await supabase
      .from("platform_connections")
      .update({
        status: "error",
        error_message: err?.message ?? "Validation failed",
      })
      .eq("user_id", caller.internalUserId)
      .eq("platform", "square");
    return NextResponse.json(
      { connected: false, error: err?.message ?? "Square validation failed" },
      { status: 200 }
    );
  }
}
