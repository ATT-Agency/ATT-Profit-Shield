import { NextResponse } from "next/server";
import { createSquareClient, type SquareEnvironment } from "@/lib/square";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadDecryptedConnection,
  resolveCaller,
} from "@/lib/platform-connections";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/square/customers?query=<optional email/name fragment>
 *
 * Lists or fuzzy-searches customers in the caller's Square merchant account
 * using their OAuth access token. The token is decrypted per-request and
 * passed into a fresh {@link createSquareClient}; nothing is cached across
 * requests.
 */
export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();

  let caller: Awaited<ReturnType<typeof resolveCaller>>;
  try {
    caller = await resolveCaller(supabase);
  } catch (err) {
    return NextResponse.json(
      { customers: [], error: err instanceof Error ? err.message : "Auth failure" },
      { status: 200 }
    );
  }
  if (!caller) {
    return NextResponse.json(
      { customers: [], error: "Not signed in." },
      { status: 401 }
    );
  }

  let connection;
  try {
    connection = await loadDecryptedConnection({
      supabase,
      internalUserId: caller.internalUserId,
      platform: "square",
    });
  } catch (err) {
    return NextResponse.json(
      {
        customers: [],
        error: err instanceof Error ? err.message : "Square not connected.",
      },
      { status: 200 }
    );
  }

  try {
    const square = createSquareClient({
      accessToken: connection.accessToken,
      environment:
        (process.env.SQUARE_ENVIRONMENT as SquareEnvironment | undefined) ??
        "production",
    });
    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim() || undefined;
    const customers = await square.listCustomers(query);
    return NextResponse.json({ customers });
  } catch (err: any) {
    return NextResponse.json(
      { customers: [], error: err?.message ?? "Square customer fetch failed" },
      { status: 200 }
    );
  }
}
