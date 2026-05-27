// Forecast math — materials-driven, deterministic, no randomization.
//
// COGS:         sum across materials of (baseline_cost × quantity)
// Revenue:      COGS / (1 − marginPct / 100)
// Drift(N):     cost-weighted average of annual drift %, prorated to N days
//                  drift_N = (sum(line_cost × annualPct) / sum(line_cost)) × (N / 365)
// Projected
//   COGS:       sum across materials of (baseline_cost × quantity × (1 + driftPct/100))
// Required
//   revenue:    projected_cogs / (1 − marginPct/100)        (preserves margin ratio)
// Required
//   price lift% = drift% exactly (identity: scale both sides by (1+x))

export type ForecastMaterial = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  baseline_cost: number;
  annualDriftPct: number | null; // null → treat as 0% drift
};

// ── Unit normalization ─────────────────────────────────────────────────
// All downstream math operates on an annualized basis. A material priced
// "$200 / mo" must be lifted to $2,400 / yr before it joins the COGS sum;
// otherwise quarterly and yearly horizons collapse to noise. Anything we
// don't recognise (physical units like "lbs", "kg", or the default "unit")
// passes through unchanged with multiplier 1.
//
//   hr / hour   → 2080  (40h × 52w — standard US working year)
//   day         → 365
//   wk / week   → 52
//   mo / month  → 12
//   qtr / quarter → 4
//   yr / year   → 1
//
// Matching is case-insensitive and tolerant of trailing punctuation /
// pluralization ("mo.", "months", "HR") so user-typed units don't slip
// through the cracks.
export function annualizeMultiplier(unit: string | null | undefined): number {
  if (!unit) return 1;
  const u = unit.trim().toLowerCase().replace(/[.\s]+$/g, "");
  switch (u) {
    case "hr":
    case "hrs":
    case "hour":
    case "hours":
      return 2080;
    case "day":
    case "days":
    case "d":
      return 365;
    case "wk":
    case "wks":
    case "week":
    case "weeks":
      return 52;
    case "mo":
    case "mos":
    case "month":
    case "months":
      return 12;
    case "qtr":
    case "qtrs":
    case "quarter":
    case "quarters":
      return 4;
    case "yr":
    case "yrs":
    case "year":
    case "years":
    case "annual":
    case "annum":
      return 1;
    default:
      return 1;
  }
}

export type MaterialsForecastInput = {
  materials: ForecastMaterial[];
  marginPct: number; // 0-99 desired gross margin
  horizonDays: number;
};

export type MaterialsForecastRow = {
  horizonDays: number;
  driftPct: number;
  cogs: number;
  projectedCogs: number;
  cogsDelta: number;
  revenue: number;
  requiredRevenue: number;
  revenueDelta: number;
  requiredPriceLiftPct: number;
  marginIfHeldPct: number;
  marginDecayPp: number;
};

// ── Building blocks ────────────────────────────────────────────────────
//
// `lineCost` returns the *annualized* dollar cost of one material line:
//   baseline_cost × quantity × annualizeMultiplier(unit)
//
// A $200/mo SaaS line with quantity=1 yields $2,400/yr. A $25/hr contractor
// at quantity=1 yields $52,000/yr. Anything denominated in a non-time unit
// (lbs, kg, "unit", "" ) passes through with multiplier 1 — i.e. it's
// already a per-product/year input.

function lineCost(m: ForecastMaterial): number {
  return m.baseline_cost * m.quantity * annualizeMultiplier(m.unit);
}

/** Annualized COGS across all materials. */
export function computeCogs(materials: ForecastMaterial[]): number {
  return materials.reduce((s, m) => s + lineCost(m), 0);
}

/** Weighted average annual drift % across materials (cost-weighted). */
export function computeBlendedAnnualDriftPct(materials: ForecastMaterial[]): number {
  const totalCost = computeCogs(materials);
  if (totalCost <= 0) return 0;
  const weighted = materials.reduce((s, m) => {
    const drift = m.annualDriftPct ?? 0;
    return s + lineCost(m) * drift;
  }, 0);
  return weighted / totalCost;
}

/** Prorated drift % at a horizon (linear interpolation of annual rate). */
export function driftPctAt(horizonDays: number, materials: ForecastMaterial[]): number {
  const annual = computeBlendedAnnualDriftPct(materials);
  return annual * (horizonDays / 365);
}

/**
 * Projected COGS for the given horizon window.
 *
 * `lineCost` returns annualized dollars, so we (a) prorate drift to the
 * horizon, (b) apply it to each line, and (c) scale the whole sum down to
 * the horizon's share of the year. The result is the dollar COGS the
 * business is expected to absorb over `horizonDays` at the projected
 * vendor prices.
 */
export function computeProjectedCogs(
  materials: ForecastMaterial[],
  horizonDays: number
): number {
  const horizonFrac = horizonDays / 365;
  return materials.reduce((s, m) => {
    const annual = m.annualDriftPct ?? 0;
    const drift = (annual * horizonFrac) / 100;
    return s + lineCost(m) * (1 + drift) * horizonFrac;
  }, 0);
}

// ── Public computation entry points ────────────────────────────────────

export function materialsForecastAt(input: MaterialsForecastInput): MaterialsForecastRow {
  const { materials, marginPct, horizonDays } = input;
  // computeCogs returns annualized dollars; scale to the horizon window so
  // baseline and projected sit on the same time basis before differencing.
  const horizonFrac = horizonDays / 365;
  const cogs = computeCogs(materials) * horizonFrac;
  const projectedCogs = computeProjectedCogs(materials, horizonDays);
  const cogsDelta = projectedCogs - cogs;
  const driftPct = cogs > 0 ? (cogsDelta / cogs) * 100 : 0;

  const marginFrac = Math.min(Math.max(marginPct / 100, 0), 0.99);
  const revenue = cogs / (1 - marginFrac);
  const requiredRevenue = projectedCogs / (1 - marginFrac);
  const revenueDelta = requiredRevenue - revenue;

  // Identity: required price lift % == drift %
  const requiredPriceLiftPct = driftPct;

  // If revenue is held constant while COGS rises:
  //   newMargin = (revenue - projectedCogs) / revenue
  const marginIfHeldPct = revenue > 0 ? ((revenue - projectedCogs) / revenue) * 100 : 0;
  const marginDecayPp = marginPct - marginIfHeldPct;

  return {
    horizonDays,
    driftPct,
    cogs,
    projectedCogs,
    cogsDelta,
    revenue,
    requiredRevenue,
    revenueDelta,
    requiredPriceLiftPct,
    marginIfHeldPct,
    marginDecayPp,
  };
}

/** Dense curve for charting — same math, every `step` days. */
export type ForecastCurvePoint = {
  day: number;
  cogs: number;          // baseline COGS (flat)
  projectedCogs: number; // rising line
  revenue: number;       // baseline revenue (flat)
  requiredRevenue: number; // rising line
};

export function materialsForecastCurve(
  materials: ForecastMaterial[],
  marginPct: number,
  maxDays = 90,
  step = 5
): ForecastCurvePoint[] {
  const marginFrac = Math.min(Math.max(marginPct / 100, 0), 0.99);
  const annualCogs = computeCogs(materials);

  const out: ForecastCurvePoint[] = [];
  for (let d = 0; d <= maxDays; d += step) {
    // Both baseline and projected lines are window-scoped (annual × d/365)
    // so the chart shows cumulative COGS over the horizon and the gap
    // between the two lines equals the dollar exposure at day d.
    const horizonFrac = d / 365;
    const baselineCogsAtD = annualCogs * horizonFrac;
    const projectedCogs = computeProjectedCogs(materials, d);
    out.push({
      day: d,
      cogs: baselineCogsAtD,
      projectedCogs,
      revenue: baselineCogsAtD / (1 - marginFrac),
      requiredRevenue: projectedCogs / (1 - marginFrac),
    });
  }
  return out;
}

/** Compose the directive banner sentence from the math. */
export function buildMaterialsDirective(args: {
  materials: ForecastMaterial[];
  marginPct: number;
}): { message: string; liftPct: number } {
  const f90 = materialsForecastAt({
    materials: args.materials,
    marginPct: args.marginPct,
    horizonDays: 90,
  });

  if (args.materials.length === 0 || f90.cogs === 0) {
    return {
      message:
        "Add raw materials in the Materials screen — the forecast engine builds its drift projection directly off your input costs.",
      liftPct: 0,
    };
  }

  return {
    message: `Vendor costs are projected to rise ${f90.driftPct.toFixed(2)}% over the next 90 days. To hold your ${args.marginPct}% target margin, revenue must rise by exactly ${f90.requiredPriceLiftPct.toFixed(2)}%.`,
    liftPct: f90.requiredPriceLiftPct,
  };
}

// ── Legacy single-line price calculator (used inline on /forecast) ─────

export function applyForecastToInputs(args: {
  currentUnitPrice: number;
  currentUnitCost: number;
  horizonDays: number;
  blendedAnnualDriftPct: number;
  marginPct: number;
}) {
  const { currentUnitPrice, currentUnitCost, horizonDays, blendedAnnualDriftPct, marginPct } = args;
  const driftPct = blendedAnnualDriftPct * (horizonDays / 365);
  const driftFrac = driftPct / 100;

  const currentMarginPct =
    currentUnitPrice > 0
      ? ((currentUnitPrice - currentUnitCost) / currentUnitPrice) * 100
      : 0;

  const projectedUnitCost = currentUnitCost * (1 + driftFrac);
  const requiredUnitPrice = currentUnitPrice * (1 + driftFrac);
  const requiredPriceLiftPct = driftPct;

  const marginIfHeldPct =
    currentMarginPct - driftPct * (1 - currentMarginPct / 100);

  return {
    horizonDays,
    driftPct,
    currentMarginPct,
    projectedUnitCost,
    projectedUnitCostIncrease: projectedUnitCost - currentUnitCost,
    requiredUnitPrice,
    requiredUnitPriceIncrease: requiredUnitPrice - currentUnitPrice,
    requiredPriceLiftPct,
    marginIfHeldPct,
    marginDecayPp: currentMarginPct - marginIfHeldPct,
    targetMarginPct: marginPct,
  };
}
