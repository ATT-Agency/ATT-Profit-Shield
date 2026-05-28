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
 * GET /api/stripe/customers?query=<optional search>
 *
 * Lists the calling user's most recent 25 connected-account customers (or
 * fuzz-searches by name/email when `query` is set). Runs inside the
 * Stripe Connect tenant identified by the caller's stored OAuth access
 * token; never touches the platform key.
 */
export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();

  let caller: Awaited<ReturnType<typeof resolveCaller>>;
  try {
    caller = await resolveCaller(supabase);
  } catch (err) {
    return NextResponse.json(
      { customers: [], error: err instanceof Error ? err.message : "Auth failure" },
      { status: 200 }
    );
  }
  if (!caller) {
    return NextResponse.json(
      { customers: [], error: "Not signed in." },
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
        customers: [],
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

    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim();

    let customers: Array<{ id: string; name: string | null; email: string | null }> = [];

    if (query) {
      const sanitized = query.replace(/"/g, "");
      const res = await stripe.customers.search({
        query: `name~"${sanitized}" OR email~"${sanitized}"`,
        limit: 25,
      });
      customers = res.data.map((c) => ({
        id: c.id,
        name: c.name ?? null,
        email: c.email ?? null,
      }));
    } else {
      const res = await stripe.customers.list({ limit: 25 });
      customers = res.data.map((c) => ({
        id: c.id,
        name: c.name ?? null,
        email: c.email ?? null,
      }));
    }

    return NextResponse.json({ customers });
  } catch (err: any) {
    return NextResponse.json(
      { customers: [], error: err?.message ?? "Failed to list customers" },
      { status: 200 }
    );
  }
}
