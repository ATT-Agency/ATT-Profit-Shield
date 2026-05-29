// Bureau of Labor Statistics Public Data API — no key required.
// Used as a fallback when the FRED API is unavailable.
// https://www.bls.gov/developers/api_signature_v2.htm

const BLS_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
const BLS_TIMEOUT_MS = 12_000;

import type { FredSeriesResponse } from "./fred";

// FRED series IDs that differ from their BLS counterparts.
// WPU* and PCU* series share the same ID in both systems — no mapping needed.
const FRED_TO_BLS: Record<string, string> = {
  CPIAUCSL: "CUSR0000SA0", // CPI-U, all items, seasonally adjusted
  PPIACO:   "WPU00000000", // PPI, all commodities
};

export type BlsFallbackResult = FredSeriesResponse & { source: "bls" };

export async function fetchBlsSeries(
  fredSeriesId: string,
  opts: { limit?: number } = {}
): Promise<BlsFallbackResult> {
  const blsId = FRED_TO_BLS[fredSeriesId] ?? fredSeriesId;
  const limit = opts.limit ?? 36;

  const now = new Date();
  const endYear = now.getFullYear();
  // Request enough years to cover the limit (12 months/year + 1 buffer year)
  const startYear = endYear - Math.ceil(limit / 12) - 1;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BLS_TIMEOUT_MS);

  try {
    const res = await fetch(BLS_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seriesid: [blsId],
        startyear: String(startYear),
        endyear: String(endYear),
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) throw new Error(`BLS returned HTTP ${res.status}`);

    const json = (await res.json()) as {
      status: string;
      Results?: {
        series: Array<{
          seriesID: string;
          data: Array<{
            year: string;
            period: string; // "M01" … "M12"; "M13" = annual avg
            value: string;
          }>;
        }>;
      };
    };

    if (json.status !== "REQUEST_SUCCEEDED" || !json.Results?.series?.[0]) {
      throw new Error("BLS returned no data");
    }

    // BLS returns newest-first; filter annual-average rows, build YYYY-MM-01 dates
    const observations = json.Results.series[0].data
      .filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period))
      .map((d) => ({
        date: `${d.year}-${d.period.slice(1)}-01`,
        value: d.value === "." ? null : Number(d.value),
      }))
      .slice(0, limit);

    return { seriesId: fredSeriesId, observations, source: "bls" };
  } finally {
    clearTimeout(timer);
  }
}
