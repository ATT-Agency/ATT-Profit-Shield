import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Yield-entry row as stored in `public.yield_entries`. Numeric columns
 * arrive from PostgREST as strings sometimes; coerce on read so the UI
 * gets clean `number`s.
 */
export type YieldEntryRow = {
  id: string;
  material: string;
  unit: string;
  invoice_date: string;
  vendor_name: string;
  stated_qty: number;
  actual_qty: number;
  invoiced_unit_cost: number;
  notes: string | null;
};

/**
 * Server-side load for /yield. Mirrors the contract that the client
 * already consumes from GET /api/yield: rows for the caller (RLS gates
 * by user_id) sorted by invoice_date desc, empty array when no session.
 *
 * Failures are swallowed (logged) so a transient Supabase blip can't
 * take down the page — the client can still mutate via /api/yield.
 */
export async function listYieldEntries(): Promise<YieldEntryRow[]> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user: authUser }
    } = await supabase.auth.getUser();
    if (!authUser) return [];

    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    const userId = userRow?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from("yield_entries")
      .select(
        "id, material, unit, invoice_date, vendor_name, stated_qty, actual_qty, invoiced_unit_cost, notes"
      )
      .eq("user_id", userId)
      .order("invoice_date", { ascending: false });

    if (error) {
      console.error("[yield] list error:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      material: row.material,
      unit: row.unit ?? "unit",
      invoice_date: row.invoice_date,
      vendor_name: row.vendor_name ?? "",
      stated_qty: Number(row.stated_qty ?? 0),
      actual_qty: Number(row.actual_qty ?? 0),
      invoiced_unit_cost: Number(row.invoiced_unit_cost ?? 0),
      notes: row.notes ?? null
    }));
  } catch (err) {
    console.error("[yield] list exception:", err);
    return [];
  }
}
