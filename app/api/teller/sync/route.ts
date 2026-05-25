import { NextResponse } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";
import type {
  TellerTransaction,
  TellerAccount,
  TellerSyncData,
} from "@/lib/plaid-types";

export const runtime = "edge";

type TellerRawAccount = {
  id: string;
  name: string;
  type?: string | null;
  subtype?: string | null;
  institution?: { name?: string | null } | null;
  balance?: {
    available?: string | number | null;
    ledger?: string | number | null;
  } | null;
};

type TellerRawTransaction = {
  id: string;
  date: string;
  description: string;
  amount: string | number;
  type?: string | null;
  details?: {
    category?: string | null;
    counterparty?: { name?: string | null; type?: string | null } | null;
  } | null;
};

// Service binding to the teller-proxy Worker. The proxy owns the mTLS
// certificate and presents it during the outbound handshake with
// api.teller.io; we just hand it a Teller URL and the Authorization
// header and read back whatever Teller returns.
type ServiceFetcher = { fetch: typeof fetch };

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function basicAuthHeader(accessToken: string): string {
  return `Basic ${btoa(`${accessToken}:`)}`;
}

/**
 * Resolve the teller-proxy service binding from the Cloudflare environment.
 *
 * The mTLS cert lives on a standalone Worker (see /teller-proxy) because
 * the Pages dashboard config wasn't honoring the cert binding declared in
 * the Pages wrangler.jsonc. The proxy Worker presents the cert; this
 * Pages function just calls into it via the TELLER_PROXY service binding.
 */
function getTellerProxy(): ServiceFetcher {
  const { env } = getRequestContext();
  const proxy = (env as { TELLER_PROXY?: ServiceFetcher }).TELLER_PROXY;
  if (!proxy) {
    throw new Error(
      "TELLER_PROXY service binding is not configured. Deploy the " +
        "teller-proxy Worker (cd teller-proxy && npx wrangler deploy), " +
        "then ensure a TELLER_PROXY service binding pointing at " +
        "`teller-proxy` exists on the Pages project (either via " +
        "wrangler.jsonc or the Pages dashboard's Bindings panel)."
    );
  }
  return proxy;
}

async function tellerRequest<T>(
  fetcher: ServiceFetcher,
  url: string,
  accessToken: string
): Promise<T> {
  const res = await fetcher.fetch(url, {
    method: "GET",
    headers: {
      Authorization: basicAuthHeader(accessToken),
      Accept: "application/json",
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `Teller request failed (${res.status}): ${body.slice(0, 400)}`
    );
  }
  try {
    return JSON.parse(body) as T;
  } catch (e) {
    throw new Error(
      `Teller response parse error: ${
        e instanceof Error ? e.message : "unknown"
      }`
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      accessToken?: string;
    };

    if (!body.accessToken) {
      return NextResponse.json(
        { error: "accessToken is required" },
        { status: 400 }
      );
    }

    let fetcher: ServiceFetcher;
    try {
      fetcher = getTellerProxy();
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "TELLER_PROXY service binding is not configured",
        },
        { status: 500 }
      );
    }

    const rawAccounts = await tellerRequest<TellerRawAccount[]>(
      fetcher,
      "https://api.teller.io/accounts",
      body.accessToken
    );

    const accounts: TellerAccount[] = [];
    const transactions: TellerTransaction[] = [];
    let institutionName: string | null = null;

    for (const a of rawAccounts) {
      if (!institutionName && a.institution?.name) {
        institutionName = a.institution.name;
      }

      accounts.push({
        id: a.id,
        name: a.name,
        type: a.type ?? "depository",
        subtype: a.subtype ?? null,
        balanceCurrent: toNumber(a.balance?.ledger),
        balanceAvailable: toNumber(a.balance?.available),
      });

      let rawTx: TellerRawTransaction[] = [];
      try {
        rawTx = await tellerRequest<TellerRawTransaction[]>(
          fetcher,
          `https://api.teller.io/accounts/${a.id}/transactions`,
          body.accessToken
        );
      } catch {
        rawTx = [];
      }

      for (const t of rawTx) {
        const amt = toNumber(t.amount);
        transactions.push({
          id: t.id,
          date: t.date,
          name: t.description,
          amount: -amt,
          category: t.details?.category ?? "Uncategorized",
          merchantName: t.details?.counterparty?.name ?? null,
          pfcPrimary: t.details?.counterparty?.type ?? null,
          pfcDetailed: t.details?.category ?? null,
        });
      }
    }

    const payload: TellerSyncData = {
      transactions,
      accounts,
      institutionName,
    };

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Teller sync failed" },
      { status: 500 }
    );
  }
}
