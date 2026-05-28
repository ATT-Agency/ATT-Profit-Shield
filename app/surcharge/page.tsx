import { SurchargeHubScreen } from "@/components/screens/surcharge-hub";
import { loadEnrichedMaterials } from "@/lib/materials";

/**
 * Screen 05 — Invoice Surcharge Integration Hub
 * Route: /surcharge
 *
 * Required env vars for live integrations:
 *   STRIPE_SECRET_KEY         Stripe restricted key (write:invoices)
 *   STRIPE_PUBLISHABLE_KEY    Stripe publishable key
 *   SQUARE_ACCESS_TOKEN       Square OAuth token
 *   FRED_API_KEY              St. Louis Fed API key
 */
export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SurchargePage() {
  const rows = await loadEnrichedMaterials();
  const initialMaterials = rows.map((r) => ({
    id: r.id,
    materialName: r.name,
    fredCode: r.fred_ppi_code ?? "",
    fredLabel: r.fred_ppi_code ?? "Custom",
    driftPct: r.annualDriftPct ?? 0,
    baselineCost: r.baseline_cost,
    quantity: r.quantity,
    unit: r.unit,
  }));
  return <SurchargeHubScreen initialMaterials={initialMaterials} />;
}
