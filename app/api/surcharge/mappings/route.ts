/**
 * GET    /api/surcharge/mappings  — List surcharge mappings for current user
 * POST   /api/surcharge/mappings  — Upsert a surcharge mapping (create or update by id)
 * DELETE /api/surcharge/mappings?id=xxx — Delete a mapping
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
    if (!userId) return NextResponse.json({ mappings: [] });

    const { data, error } = await supabase
      .from("surcharge_mappings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ mappings: data ?? [] });
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
    const {
      id,
      material_id,
      material_name,
      fred_code,
      fred_label,
      billing_label,
      surcharge_enabled,
      mapped_platform,
      last_fred_pct,
    } = body;

    if (!material_name || !billing_label) {
      return NextResponse.json(
        { error: "material_name and billing_label are required" },
        { status: 400 }
      );
    }

    const payload = {
      user_id: userId,
      material_id: material_id ?? null,
      material_name,
      fred_code: fred_code ?? null,
      fred_label: fred_label ?? null,
      billing_label,
      surcharge_enabled: surcharge_enabled ?? true,
      mapped_platform: mapped_platform ?? null,
      last_fred_pct: last_fred_pct ?? null,
      last_synced_at:
        last_fred_pct != null ? new Date().toISOString() : null,
    };

    let result;
    if (id) {
      result = await supabase
        .from("surcharge_mappings")
        .update(payload)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
    } else {
      result = await supabase
        .from("surcharge_mappings")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error)
      return NextResponse.json({ error: result.error.message }, { status: 422 });
    return NextResponse.json({ mapping: result.data });
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
      .from("surcharge_mappings")
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
