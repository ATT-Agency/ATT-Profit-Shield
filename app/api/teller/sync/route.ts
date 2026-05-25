import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import https from "https";
import type {
  TellerTransaction,
  TellerAccount,
  TellerSyncData,
} from "@/lib/plaid-types";

export const runtime = "nodejs";

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

type MtlsMaterial = string | Buffer;

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function basicAuthHeader(accessToken: string): string {
  const raw = `${accessToken}:`;
  const encoded = Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Load Teller mTLS materials, prioritizing env-string mode (Vercel safe).
 *
 * 1. If TELLER_CERT and TELLER_KEY are both present in the environment,
 *    treat them as PEM strings. Vercel encodes multiline secrets with
 *    literal "\n" sequences, so we unescape them back into real newlines
 *    before handing them to the HTTPS layer.
 *
 * 2. Fallback for localhost: read the cert/key files from disk using the
 *    paths in TELLER_CERT_PATH / TELLER_KEY_PATH. This branch is never
 *    hit on Vercel (no certs/ folder ships in the build).
 *
 * 3. If neither path is satisfied, surface a clear configuration error.
 */
function loadTellerCreds(): { cert: MtlsMaterial; key: MtlsMaterial } {
  const envCert = process.env.TELLER_CERT;
  const envKey = process.env.TELLER_KEY;

  if (envCert && envKey) {
    return {
      cert: envCert.replace(/\\n/g, "\n"),
      key: envKey.replace(/\\n/g, "\n"),
    };
  }

  const certPath = process.env.TELLER_CERT_PATH;
  const keyPath = process.env.TELLER_KEY_PATH;
  if (certPath && keyPath) {
    const cert = fs.readFileSync(path.resolve(process.cwd(), certPath));
    const key = fs.readFileSync(path.resolve(process.cwd(), keyPath));
    return { cert, key };
  }

  throw new Error(
    "Teller mTLS credentials are not configured. Set TELLER_CERT and TELLER_KEY env vars (production) or TELLER_CERT_PATH and TELLER_KEY_PATH (local)."
  );
}

function tellerRequest<T>(
  url: string,
  accessToken: string,
  cert: MtlsMaterial,
  key: MtlsMaterial
): Promise<T> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        host: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        cert,
        key,
        headers: {
          Authorization: basicAuthHeader(accessToken),
          Accept: "application/json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            try {
              resolve(JSON.parse(body) as T);
            } catch (e) {
              reject(
                new Error(
                  `Teller response parse error: ${
                    e instanceof Error ? e.message : "unknown"
                  }`
                )
              );
            }
          } else {
            reject(
              new Error(`Teller request failed (${status}): ${body.slice(0, 400)}`)
            );
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
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

    let cert: MtlsMaterial;
    let key: MtlsMaterial;
    try {
      ({ cert, key } = loadTellerCreds());
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "Teller mTLS credentials are not configured",
        },
        { status: 500 }
      );
    }

    const rawAccounts = await tellerRequest<TellerRawAccount[]>(
      "https://api.teller.io/accounts",
      body.accessToken,
      cert,
      key
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
          `https://api.teller.io/accounts/${a.id}/transactions`,
          body.accessToken,
          cert,
          key
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
