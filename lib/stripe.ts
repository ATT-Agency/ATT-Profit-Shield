import Stripe from "stripe";

// Stripe's config type is `ConstructorParameters<typeof Stripe>[1]`. We rely
// on it implicitly via the constructor call sites — pulling it out into a
// named type isn't possible because the SDK doesn't re-export `StripeConfig`
// from its public entry point.
type StripeApiVersion = NonNullable<
  NonNullable<ConstructorParameters<typeof Stripe>[1]>["apiVersion"]
>;

/**
 * Per-tenant Stripe client factory.
 *
 * The application is now multi-tenant: every API call must run inside the
 * Stripe account that the calling user authorized via Stripe Connect. There
 * are two equivalent ways to address a connected account, and this module
 * supports both depending on what the caller has stored:
 *
 *   1. `accessToken` mode (Standard accounts, OAuth) — the access token IS
 *      a fully privileged secret key scoped to the connected account. Use it
 *      directly as the SDK key.
 *
 *   2. `platform + stripeAccount` mode (Express / Custom) — the platform's
 *      own secret key acts on behalf of the connected account via the
 *      `Stripe-Account` header.
 *
 * Either way, no request ever runs against a global "platform-wide" key, so
 * a token leak cannot reach another tenant's data.
 *
 * Edge runtime note: `Stripe.createFetchHttpClient()` swaps the default Node
 * `https` agent for `fetch`, which is the only thing the Cloudflare Workers
 * runtime exposes. Stripe's own crypto provider works under `crypto.subtle`.
 */

// Pinned to the Stripe API version in use by the rest of the platform.
// `StripeApiVersion` is the SDK's `LatestApiVersion` union — the constructor
// will reject any string outside it.
const STRIPE_API_VERSION: StripeApiVersion = "2026-05-27.dahlia";

export type StripeTenantCredentials =
  | {
      mode: "oauth";
      /** Connected account's OAuth access token (rk_live_… / sk_live_…). */
      accessToken: string;
      /** acct_… — kept for logging and Connect dashboard deep links. */
      stripeUserId?: string;
    }
  | {
      mode: "platform";
      /** Platform's secret key (STRIPE_SECRET_KEY). */
      platformKey: string;
      /** acct_… of the connected account to act on behalf of. Required. */
      stripeUserId: string;
    };

/**
 * Build a Stripe SDK instance bound to a single tenant. Each invocation
 * returns a fresh client — never share an instance between requests, because
 * `stripeAccount` mutates the outgoing header for the lifetime of the client.
 */
export function getStripeClientForTenant(
  creds: StripeTenantCredentials
): Stripe {
  if (creds.mode === "oauth") {
    if (!creds.accessToken) {
      throw new Error("Stripe OAuth access token is missing for this user.");
    }
    return new Stripe(creds.accessToken, {
      apiVersion: STRIPE_API_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
      typescript: true,
    });
  }

  if (!creds.platformKey) {
    throw new Error("STRIPE_SECRET_KEY (platform key) is missing.");
  }
  if (!creds.stripeUserId) {
    throw new Error(
      "stripeUserId is required when using the platform-key + Connect mode."
    );
  }
  return new Stripe(creds.platformKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    typescript: true,
    stripeAccount: creds.stripeUserId,
  });
}

/**
 * Platform-level client — used ONLY for the OAuth code-exchange roundtrip
 * during `app/api/auth/stripe/callback`. It must never be used to read or
 * mutate tenant data; that would short-circuit Stripe Connect's isolation.
 */
export function getStripePlatformClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is missing. Set the platform account's secret key " +
        "in the Cloudflare Pages encrypted environment variables."
    );
  }
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    typescript: true,
  });
}

export type SurchargeLineItem = {
  description: string;
  amountCents: number; // smallest currency unit
  currency?: string; // default usd
  metadata?: Record<string, string>;
};
