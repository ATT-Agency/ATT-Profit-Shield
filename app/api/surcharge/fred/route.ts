/**
 * GET /api/surcharge/fred?codes=WPU101,WPU081,...
 *
 * Fetches live YoY FRED PPI deltas for a comma-separated list of series codes.
 * Used by the Surcharge Hub to refresh surcharge percentages.
 *
 * Required env var: FRED_API_KEY (St. Louis Fed API key)
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchFredSeries, yoyDelta } from "@/lib/fred";

export const runtime = "edge";
export const revalidate = 21600; // 6 hours

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codesParam = searchParams.get("codes") ?? "";
  const codes = codesParam
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (codes.length === 0) {
    return NextResponse.json({ error: "No series codes provided" }, { status: 400 });
  }
  if (codes.length > 20) {
    return NextResponse.json(
      { error: "Maximum 20 series codes per request" },
      { status: 400 }
    );
  }

  const results = await Promise.allSettled(
    codes.map(async (code) => {
      const series = await fetchFredSeries(code, { limit: 18 });
      const delta = yoyDelta(series.observations);
      return {
        code,
        deltaPct: delta?.deltaPct ?? null,
        latestDate: delta?.latestDate ?? null,
        latestValue: delta?.latestValue ?? null,
      };
    })
  );

  const data: Record<
    string,
    { deltaPct: number | null; latestDate: string | null; latestValue: number | null }
  > = {};
  for (let i = 0; i < codes.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      data[codes[i]] = r.value;
    } else {
      data[codes[i]] = { deltaPct: null, latestDate: null, latestValue: null };
    }
  }

  return NextResponse.json({ data, fetchedAt: new Date().toISOString() });
}
