import { YieldTrackerScreen } from "@/components/screens/yield-tracker";
import type { YieldEntry } from "@/components/screens/yield-tracker";
import { listYieldEntries } from "@/lib/yield";

/**
 * Screen 06 — Usable Yield Tracker
 * Route: /yield
 *
 * SSR pattern mirrors /materials, /forecast, /negotiate: dynamic per
 * request, server-side data fetch, client island hydrates with
 * `initialEntries` already populated. This avoids the SSR/CSR auth
 * race that previously showed the layout sign-in/out chrome in a stale
 * state on first paint of this route.
 */
export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function YieldPage() {
  const rows = await listYieldEntries();

  const initialEntries: YieldEntry[] = rows.map((r) => ({
    id: r.id,
    material: r.material,
    unit: r.unit,
    invoice_date: r.invoice_date,
    vendor_name: r.vendor_name,
    stated_qty: r.stated_qty,
    actual_qty: r.actual_qty,
    invoiced_unit_cost: r.invoiced_unit_cost,
    notes: r.notes ?? undefined
  }));

  return <YieldTrackerScreen initialEntries={initialEntries} />;
}
