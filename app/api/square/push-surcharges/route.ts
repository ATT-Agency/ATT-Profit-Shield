import { NextResponse } from "next/server";
import {
  createSquareClient,
  type SquareEnvironment,
  type SquareSurchargeItem,
} from "@/lib/square";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadDecryptedConnection,
  resolveCaller,
} from "@/lib/platform-connections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/square/push-surcharges
 *
 * Body: { locationId, customerId, items: SquareSurchargeItem[] }
 *
 * Creates an Order + draft Invoice in the caller's Square merchant account.
 * The merchant finalizes / sends from the Square dashboard. Auth is per-user
 * via the OAuth access token stored on public.platform_connections.
 */
type Body = {
  locationId: string;
  customerId: string;
  items: SquareSurchargeItem[];
};

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  let caller: Awaited<ReturnType<typeof resolveCaller>>;
  try {
    caller = await resolveCaller(supabase);
  } catch (err) {
    return NextResponse.json(
      { pushed: false, error: err instanceof Error ? err.message : "Auth failure" },
      { status: 200 }
    );
  }
  if (!caller) {
    return NextResponse.json(
      { pushed: false, error: "Not signed in." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { pushed: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  if (!body.locationId) {
    return NextResponse.json(
      { pushed: false, error: "locationId required" },
      { status: 400 }
    );
  }
  if (!body.customerId) {
    return NextResponse.json(
      { pushed: false, error: "customerId required" },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { pushed: false, error: "items required" },
      { status: 400 }
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
        pushed: false,
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
    const result = await square.pushSurcharges({
      locationId: body.locationId,
      customerId: body.customerId,
      items: body.items,
    });

    await supabase
      .from("platform_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", caller.internalUserId)
      .eq("platform", "square");

    return NextResponse.json({
      pushed: true,
      orderId: result.orderId,
      invoiceId: result.invoiceId,
      publicUrl: result.publicUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { pushed: false, error: err?.message ?? "Square push failed" },
      { status: 200 }
    );
  }
}
