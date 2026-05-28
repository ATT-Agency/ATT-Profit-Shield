/**
 * GET    /api/yield           — List yield entries (with optional filters)
 * POST   /api/yield           — Create entries (single or bulk array)
 * PATCH  /api/yield           — Inline-edit a single entry field
 * DELETE /api/yield?id=xxx    — Delete an entry
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "edge";

async function getInternalUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { supabase, userId: null };
  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  return { supabase, userId: userRow?.id ?? null };
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, userId } = await getInternalUser();
    if (!userId) return NextResponse.json({ entries: [] });

    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");
    const vendor = searchParams.get("vendor");

    let query = supabase
      .from("yield_entries")
      .select("*")
      .eq("user_id", userId)
      .order("invoice_date", { ascending: false });

    if (fromDate) query = query.gte("invoice_date", fromDate);
    if (toDate) query = query.lte("invoice_date", toDate);
    if (vendor) query = query.ilike("vendor_name", `%${vendor}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, userId } = await getInternalUser();
    if (!userId)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];

    if (items.length === 0)
      return NextResponse.json({ error: "No entries provided" }, { status: 400 });
    if (items.length > 1000)
      return NextResponse.json(
        { error: "Maximum 1000 entries per import" },
        { status: 400 }
      );

    const rows = items.map(
      (item: {
        material?: string;
        unit?: string;
        invoice_date?: string;
        vendor_name?: string;
        stated_qty?: number | string;
        actual_qty?: number | string;
        invoiced_unit_cost?: number | string;
        notes?: string;
      }) => ({
        user_id: userId,
        material: item.material ?? "Unknown",
        unit: item.unit ?? "unit",
        invoice_date:
          item.invoice_date ?? new Date().toISOString().slice(0, 10),
        vendor_name: item.vendor_name ?? "",
        stated_qty: Number(item.stated_qty ?? 0),
        actual_qty: Number(item.actual_qty ?? 0),
        invoiced_unit_cost: Number(item.invoiced_unit_cost ?? 0),
        notes: item.notes ?? null,
      })
    );

    const { data, error } = await supabase
      .from("yield_entries")
      .insert(rows)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ entries: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, userId } = await getInternalUser();
    if (!userId)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const allowed = [
      "material",
      "unit",
      "invoice_date",
      "vendor_name",
      "stated_qty",
      "actual_qty",
      "invoiced_unit_cost",
      "notes",
    ];
    const update: Record<string, unknown> = {};
    for (const f of allowed) {
      if (fields[f] !== undefined) update[f] = fields[f];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("yield_entries")
      .update(update)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ entry: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { supabase, userId } = await getInternalUser();
    if (!userId)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase
      .from("yield_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
