/**
 * GET    /api/negotiate         — List vendor anomalies for current user
 * POST   /api/negotiate         — Create a new vendor anomaly
 * PATCH  /api/negotiate         — Update status / notes on an anomaly
 * DELETE /api/negotiate?id=xxx  — Delete an anomaly
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

export async function GET() {
  try {
    const { supabase, userId } = await getInternalUser();
    if (!userId) return NextResponse.json({ anomalies: [] });

    const { data, error } = await supabase
      .from("vendor_anomalies")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ anomalies: data ?? [] });
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

    const rows = items.map(
      (item: {
        vendor_name?: string;
        material?: string;
        unit?: string;
        contact_name?: string;
        contact_email?: string;
        baseline_unit_cost?: number;
        quoted_unit_cost?: number;
        quantity?: number;
        fred_code?: string;
        fred_label?: string;
        fred_ppi_yoy_pct?: number;
        date_quoted?: string;
        notes?: string;
      }) => ({
        user_id: userId,
        vendor_name: item.vendor_name ?? "Unknown",
        material: item.material ?? "Unknown",
        unit: item.unit ?? "unit",
        contact_name: item.contact_name ?? null,
        contact_email: item.contact_email ?? null,
        baseline_unit_cost: Number(item.baseline_unit_cost ?? 0),
        quoted_unit_cost: Number(item.quoted_unit_cost ?? 0),
        quantity: Number(item.quantity ?? 1),
        fred_code: item.fred_code ?? "",
        fred_label: item.fred_label ?? "",
        fred_ppi_yoy_pct: Number(item.fred_ppi_yoy_pct ?? 0),
        date_quoted:
          item.date_quoted ?? new Date().toISOString().slice(0, 10),
        status: "flagged",
        notes: item.notes ?? null,
      })
    );

    const { data, error } = await supabase
      .from("vendor_anomalies")
      .insert(rows)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ anomalies: data }, { status: 201 });
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
    const { id, status, notes, email_template_override } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (status !== undefined) {
      if (!["flagged", "in-progress", "resolved"].includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      update.status = status;
      if (status === "resolved") update.resolved_at = new Date().toISOString();
      else update.resolved_at = null;
    }
    if (notes !== undefined) update.notes = notes;
    if (email_template_override !== undefined)
      update.email_template_override = email_template_override;

    const { data, error } = await supabase
      .from("vendor_anomalies")
      .update(update)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ anomaly: data });
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
      .from("vendor_anomalies")
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
