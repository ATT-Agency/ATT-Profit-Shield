import { NextResponse } from "next/server";
import { getStripeClientForTenant, type SurchargeLineItem } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadDecryptedConnection,
  resolveCaller,
} from "@/lib/platform-connections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/push-surcharges
 *
 * Body: { customerId: string, items: SurchargeLineItem[], createInvoice?: boolean }
 *
 * Per-tenant flow:
 *   1. Resolve the caller and decrypt their Stripe OAuth access token.
 *   2. Spin up a tenant-scoped Stripe client.
 *   3. For each surcharge row, create an InvoiceItem on the customer.
 *   4. Optionally create a draft Invoice so the merchant can finalize from
 *      their own Stripe dashboard.
 *
 * Amounts arrive in the smallest currency unit (cents for USD). Items with
 * non-finite or non-positive amounts are skipped silently — the upstream
 * Hub already validates, but defense-in-depth.
 */

type Body = {
  customerId: string;
  items: SurchargeLineItem[];
  createInvoice?: boolean;
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
      platform: "stripe",
    });
  } catch (err) {
    return NextResponse.json(
      {
        pushed: false,
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

    // Filter invalid amounts up-front so we don't waste round-trips on rows
    // the Hub already discarded — then fire all surviving creates in parallel.
    // Promise.all preserves fail-fast semantics: if any one rejects, the
    // outer try/catch surfaces the error just like the previous serial loop.
    const validItems = body.items.filter(
      (item) => Number.isFinite(item.amountCents) && item.amountCents > 0
    );
    const created = await Promise.all(
      validItems.map((item) =>
        stripe.invoiceItems.create({
          customer: body.customerId,
          amount: Math.round(item.amountCents),
          currency: item.currency ?? "usd",
          description: item.description,
          metadata: {
            source: "att-profit-shield",
            ...(item.metadata ?? {}),
          },
        })
      )
    );
    const createdItems = created.map((c) => ({
      id: c.id,
      amount: c.amount,
      description: c.description,
    }));

    let invoice: { id: string; hostedUrl: string | null; status: string | null } | null = null;
    if (body.createInvoice !== false) {
      const inv = await stripe.invoices.create({
        customer: body.customerId,
        auto_advance: false,
        collection_method: "send_invoice",
        days_until_due: 30,
        description: "Profit Shield — FRED PPI 90-day exposure surcharge",
      });
      invoice = {
        id: inv.id,
        hostedUrl: inv.hosted_invoice_url ?? null,
        status: inv.status ?? null,
      };
    }

    // Stamp the last successful push onto the connection row so the
    // Surcharge Hub can show a "last activity" badge.
    await supabase
      .from("platform_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", caller.internalUserId)
      .eq("platform", "stripe");

    return NextResponse.json({
      pushed: true,
      itemsCreated: createdItems.length,
      items: createdItems,
      invoice,
    });
  } catch (err: any) {
    return NextResponse.json(
      { pushed: false, error: err?.message ?? "Stripe push failed" },
      { status: 200 }
    );
  }
}
