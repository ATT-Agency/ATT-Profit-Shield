import { NegotiationToolScreen } from "@/components/screens/negotiation-tool";
import { loadEnrichedMaterials } from "@/lib/materials";

/**
 * Screen 06 — Vendor Price Negotiation Tool
 * Route: /negotiate
 *
 * Required env vars for live features:
 *   FRED_API_KEY       St. Louis Fed API key (for live PPI benchmarks)
 *   SENDGRID_API_KEY   SendGrid API key (for one-click email send)
 *   RESEND_API_KEY     Resend API key (alternative to SendGrid)
 *
 * Email send is currently copy-to-clipboard only.
 */
export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function NegotiatePage() {
  const rows = await loadEnrichedMaterials();
  const initialMaterials = rows.map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    quantity: r.quantity,
    baselineCost: r.baseline_cost,
    fredCode: r.fred_ppi_code ?? "",
    fredLabel: r.fred_ppi_code ?? "Custom",
    annualDriftPct: r.annualDriftPct ?? 0,
  }));
  return <NegotiationToolScreen initialMaterials={initialMaterials} />;
}
