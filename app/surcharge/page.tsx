import { SurchargeHubScreen } from "@/components/screens/surcharge-hub";
import { loadEnrichedMaterials } from "@/lib/materials";

/**
 * Screen 05 — Invoice Surcharge Integration Hub
 * Route: /surcharge
 *
 * Required env vars for live integrations:
 *   STRIPE_SECRET_KEY            Platform secret (used ONLY for OAuth token exchange)
 *   STRIPE_CLIENT_ID             Stripe Connect application id (ca_…)
 *   STRIPE_PUBLISHABLE_KEY       Stripe publishable key (client bundle)
 *   SQUARE_APPLICATION_ID        Square Developer Dashboard application id
 *   SQUARE_APPLICATION_SECRET    Square Developer Dashboard application secret
 *   SQUARE_ENVIRONMENT           'production' (default) or 'sandbox'
 *   ENCRYPTION_MASTER_KEY        32-byte hex string for AES-GCM token storage
 *   FRED_API_KEY                 St. Louis Fed API key
 *   NEXT_PUBLIC_APP_URL          External base URL for OAuth redirect_uri
 *
 * Per-user OAuth tokens for Stripe & Square live encrypted on
 * public.platform_connections — see lib/crypto.ts and lib/platform-connections.ts.
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
