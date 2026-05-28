import { SurchargeHubScreen } from "@/components/screens/surcharge-hub";

/**
 * Screen 05 — Invoice Surcharge Integration Hub
 * Route: /surcharge
 *
 * Required env vars for live integrations:
 *   STRIPE_SECRET_KEY         Stripe restricted key (write:invoices)
 *   STRIPE_PUBLISHABLE_KEY    Stripe publishable key
 *   SQUARE_ACCESS_TOKEN       Square OAuth token (sandbox or prod)
 *   QUICKBOOKS_CLIENT_ID      QuickBooks OAuth 2.0 client ID
 *   QUICKBOOKS_CLIENT_SECRET  QuickBooks OAuth 2.0 client secret
 *   QUICKBOOKS_REDIRECT_URI   OAuth callback URL
 *   FRED_API_KEY              St. Louis Fed API key
 */
export default function SurchargePage() {
  return <SurchargeHubScreen />;
}
