/**
 * teller-proxy
 *
 * Standalone Cloudflare Worker that forwards incoming requests to
 * api.teller.io using a bound mTLS client certificate. Exposed to the
 * att-profit-shield Pages project via a service binding (TELLER_PROXY).
 *
 * Why this exists: the Pages project's wrangler.jsonc mtls_certificates
 * block isn't being honored by its dashboard config, so the mTLS cert
 * is bound on this Worker instead. Pages calls env.TELLER_PROXY.fetch(...);
 * this Worker presents the cert and relays the response.
 *
 * Security posture:
 *  - workers_dev is disabled so this Worker has no public URL.
 *  - The only inbound path is the service binding, which is auth'd by
 *    Cloudflare's internal RPC.
 *  - We only forward Authorization and Accept headers, stripping any
 *    CF-internal headers (cf-ray, cf-connecting-ip, x-forwarded-*) that
 *    might otherwise leak through.
 *  - The upstream host is pinned to api.teller.io regardless of the
 *    incoming URL's host, so a misconfigured caller can't redirect
 *    traffic elsewhere.
 */

type Env = {
  TELLER_MTLS: { fetch: typeof fetch };
};

const TELLER_HOST = "api.teller.io";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    const tellerUrl = `https://${TELLER_HOST}${incoming.pathname}${incoming.search}`;

    const headers = new Headers();
    const auth = request.headers.get("authorization");
    if (auth) headers.set("Authorization", auth);
    const accept = request.headers.get("accept");
    if (accept) headers.set("Accept", accept);

    const init: RequestInit = {
      method: request.method,
      headers,
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    return env.TELLER_MTLS.fetch(tellerUrl, init);
  },
};
