import { NegotiationToolScreen } from "@/components/screens/negotiation-tool";

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
 * Connect SENDGRID_API_KEY or RESEND_API_KEY to enable direct send.
 */
export default function NegotiatePage() {
  return <NegotiationToolScreen />;
}
