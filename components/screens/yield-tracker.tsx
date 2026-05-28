"use client";

/**
 * Screen 07 — Usable Yield Tracker
 *
 * Dense compact table for tracking stated vs. actual received quantities.
 * Calculates effective cost per unit and hidden inflation rate per delivery.
 *
 * No external API keys required for this screen — fully local computation.
 * Data is persisted to localStorage so it survives page reloads.
 *
 * If you wish to sync entries to Supabase, add a server action similar to
 * createMaterial in app/materials/actions.ts and call it from handleAdd.
 */

import { useState, useEffect, useRef, useId } from "react";
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Download,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/screen-header";
import { COPY } from "@/lib/copy";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface YieldEntry {
  id: string;
  material: string;
  unit: string;
  invoiceDate: string;
  vendorName: string;
  statedQty: number;      // qty on invoice / packing slip
  actualQty: number;      // qty measured after receipt
  invoicedUnitCost: number; // price per stated unit from invoice
}

interface YieldRow extends YieldEntry {
  // Computed
  yieldPct: number;               // actualQty / statedQty * 100
  effectiveCost: number;          // invoicedUnitCost / yieldPct * 100 (cost per actual unit)
  hiddenInflationPct: number;     // how much more you're paying per real unit vs. stated
  totalInvoiced: number;          // statedQty * invoicedUnitCost
  totalEffective: number;         // actualQty * effectiveCost
  lossAmt: number;                // totalEffective - totalInvoiced
}

type YieldTone = "good" | "warn" | "danger";

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ps:yield:entries";

const DEMO_ENTRIES: YieldEntry[] = [
  {
    id: "y1",
    material: "Stainless Steel Rod (304)",
    unit: "unit",
    invoiceDate: "2025-05-12",
    vendorName: "Apex Steel Fabricators",
    statedQty: 12,
    actualQty: 11.5,
    invoicedUnitCost: 480,
  },
  {
    id: "y2",
    material: "Structural Lumber (2×6)",
    unit: "bd ft",
    invoiceDate: "2025-05-08",
    vendorName: "Pacific Lumber Supply",
    statedQty: 8000,
    actualQty: 7620,
    invoicedUnitCost: 0.68,
  },
  {
    id: "y3",
    material: "Ultra-Low Sulfur Diesel",
    unit: "gal",
    invoiceDate: "2025-05-05",
    vendorName: "Diesel Direct LLC",
    statedQty: 300,
    actualQty: 298,
    invoicedUnitCost: 4.05,
  },
  {
    id: "y4",
    material: "Corrugated Cardboard Boxes",
    unit: "unit",
    invoiceDate: "2025-04-28",
    vendorName: "Prime Paper & Pack",
    statedQty: 2400,
    actualQty: 2352,
    invoicedUnitCost: 1.42,
  },
  {
    id: "y5",
    material: "Aluminum Sheet (6061-T6)",
    unit: "lb",
    invoiceDate: "2025-05-20",
    vendorName: "Atlas Aluminum Works",
    statedQty: 650,
    actualQty: 644,
    invoicedUnitCost: 3.15,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeRow(e: YieldEntry): YieldRow {
  const statedQty = Math.max(e.statedQty, 0.0001); // guard div/0
  const actualQty = Math.max(e.actualQty, 0);
  const yieldPct = (actualQty / statedQty) * 100;
  const effectiveCost = yieldPct > 0 ? (e.invoicedUnitCost / yieldPct) * 100 : 0;
  const hiddenInflationPct = yieldPct > 0 ? ((100 / yieldPct) - 1) * 100 : 0;
  const totalInvoiced = statedQty * e.invoicedUnitCost;
  const totalEffective = actualQty > 0 ? (actualQty * effectiveCost) : 0;
  const lossAmt = totalEffective - totalInvoiced;
  return {
    ...e,
    yieldPct,
    effectiveCost,
    hiddenInflationPct,
    totalInvoiced,
    totalEffective,
    lossAmt,
  };
}

function yieldTone(yieldPct: number): YieldTone {
  if (yieldPct >= 98) return "good";
  if (yieldPct >= 93) return "warn";
  return "danger";
}

function yieldBadge(yieldPct: number) {
  const tone = yieldTone(yieldPct);
  const badgeTone = tone === "good" ? "electric" : tone === "warn" ? "jackson" : "danger";
  const label = tone === "good" ? "Good yield" : tone === "warn" ? "Short-shipped" : "Significant loss";
  return <Badge tone={badgeTone}>{label}</Badge>;
}

function csvExport(rows: YieldRow[]) {
  const headers = [
    "Material",
    "Vendor",
    "Date",
    "Unit",
    "Stated Qty",
    "Actual Qty",
    "Yield %",
    "Invoiced $/unit",
    "Effective $/unit",
    "Hidden Inflation %",
    "Total Invoiced",
    "Hidden Loss $",
  ];
  const lines = rows.map((r) =>
    [
      `"${r.material}"`,
      `"${r.vendorName}"`,
      r.invoiceDate,
      r.unit,
      r.statedQty,
      r.actualQty,
      r.yieldPct.toFixed(2),
      r.invoicedUnitCost.toFixed(4),
      r.effectiveCost.toFixed(4),
      r.hiddenInflationPct.toFixed(2),
      r.totalInvoiced.toFixed(2),
      r.lossAmt.toFixed(2),
    ].join(",")
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yield-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Add-row form ───────────────────────────────────────────────────────────────

interface AddFormValues {
  material: string;
  unit: string;
  invoiceDate: string;
  vendorName: string;
  statedQty: string;
  actualQty: string;
  invoicedUnitCost: string;
}

const EMPTY_FORM: AddFormValues = {
  material: "",
  unit: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  vendorName: "",
  statedQty: "",
  actualQty: "",
  invoicedUnitCost: "",
};

function AddRowForm({ onAdd }: { onAdd: (entry: YieldEntry) => void }) {
  const [form, setForm] = useState<AddFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  function set(key: keyof AddFormValues, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const stated = parseFloat(form.statedQty);
    const actual = parseFloat(form.actualQty);
    const cost = parseFloat(form.invoicedUnitCost);

    if (!form.material.trim()) return setError("Material name is required.");
    if (isNaN(stated) || stated <= 0) return setError("Stated quantity must be > 0.");
    if (isNaN(actual) || actual < 0) return setError("Actual quantity must be ≥ 0.");
    if (isNaN(cost) || cost <= 0) return setError("Invoiced unit cost must be > 0.");
    if (actual > stated) return setError("Actual quantity cannot exceed stated quantity.");

    setError(null);
    onAdd({
      id: `y${Date.now()}`,
      material: form.material.trim(),
      unit: form.unit.trim() || "unit",
      invoiceDate: form.invoiceDate,
      vendorName: form.vendorName.trim() || "—",
      statedQty: stated,
      actualQty: actual,
      invoicedUnitCost: cost,
    });
    setForm(EMPTY_FORM);
  }

  const fieldClass =
    "h-9 w-full rounded-xl border border-cocoa-700 bg-cocoa-900 px-3 py-1 text-sm text-cream placeholder:text-cream-mute focus:outline-none focus:ring-1 focus:ring-vibrant focus:border-vibrant";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-6 shadow-card"
    >
      <p className="text-[11px] uppercase tracking-[0.22em] text-vibrant mb-4">Add delivery</p>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Material */}
        <div className="col-span-2 space-y-1">
          <label htmlFor={`${uid}-mat`} className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
            Material
          </label>
          <input
            id={`${uid}-mat`}
            className={fieldClass}
            placeholder="e.g. Steel Rod"
            value={form.material}
            onChange={(e) => set("material", e.target.value)}
            required
          />
        </div>

        {/* Vendor */}
        <div className="col-span-2 space-y-1">
          <label htmlFor={`${uid}-vendor`} className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
            Vendor
          </label>
          <input
            id={`${uid}-vendor`}
            className={fieldClass}
            placeholder="Vendor name"
            value={form.vendorName}
            onChange={(e) => set("vendorName", e.target.value)}
          />
        </div>

        {/* Date */}
        <div className="space-y-1">
          <label htmlFor={`${uid}-date`} className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
            Invoice date
          </label>
          <input
            id={`${uid}-date`}
            type="date"
            className={fieldClass}
            value={form.invoiceDate}
            onChange={(e) => set("invoiceDate", e.target.value)}
          />
        </div>

        {/* Unit */}
        <div className="space-y-1">
          <label htmlFor={`${uid}-unit`} className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
            Unit
          </label>
          <input
            id={`${uid}-unit`}
            className={fieldClass}
            placeholder="unit, lb, gal…"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
          />
        </div>

        {/* Stated qty */}
        <div className="space-y-1">
          <label htmlFor={`${uid}-stated`} className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
            Stated qty
          </label>
          <input
            id={`${uid}-stated`}
            type="number"
            min="0.001"
            step="any"
            className={fieldClass}
            placeholder="100"
            value={form.statedQty}
            onChange={(e) => set("statedQty", e.target.value)}
            required
          />
        </div>

        {/* Actual qty */}
        <div className="space-y-1">
          <label htmlFor={`${uid}-actual`} className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
            Actual qty
          </label>
          <input
            id={`${uid}-actual`}
            type="number"
            min="0"
            step="any"
            className={fieldClass}
            placeholder="97"
            value={form.actualQty}
            onChange={(e) => set("actualQty", e.target.value)}
            required
          />
        </div>

        {/* Unit cost */}
        <div className="space-y-1">
          <label htmlFor={`${uid}-cost`} className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
            $/unit (invoice)
          </label>
          <input
            id={`${uid}-cost`}
            type="number"
            min="0.0001"
            step="any"
            className={fieldClass}
            placeholder="4.80"
            value={form.invoicedUnitCost}
            onChange={(e) => set("invoicedUnitCost", e.target.value)}
            required
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-hotpink-soft border border-hotpink/30 bg-hotpink/10 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="mt-4">
        <Button type="submit" size="sm">
          <Plus className="size-3.5" />
          Add row
        </Button>
      </div>
    </form>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────────

function YieldTable({
  rows,
  onDelete,
}: {
  rows: YieldRow[];
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-cocoa-700 p-12 text-center">
        <TrendingDown className="size-8 text-cream-mute mx-auto mb-3 opacity-50" />
        <p className="text-cream-dim font-medium">No deliveries tracked yet.</p>
        <p className="text-sm text-cream-mute mt-1">
          Add a delivery above to start calculating effective costs.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 shadow-card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-cocoa-800">
            {[
              { label: "Material / Vendor", width: "min-w-[180px]", align: "left" },
              { label: "Date", width: "w-24", align: "left" },
              { label: "Unit", width: "w-16", align: "left" },
              { label: "Stated", width: "w-20", align: "right" },
              { label: "Actual", width: "w-20", align: "right" },
              { label: "Yield %", width: "w-24", align: "right" },
              { label: "Invoiced $/unit", width: "w-28", align: "right" },
              { label: "Effective $/unit", width: "w-28", align: "right" },
              { label: "Hidden Inflation", width: "w-28", align: "right" },
              { label: "Total Invoiced", width: "w-28", align: "right" },
              { label: "Hidden Loss", width: "w-24", align: "right" },
              { label: "Signal", width: "w-32", align: "center" },
              { label: "", width: "w-10", align: "center" },
            ].map((col) => (
              <th
                key={col.label}
                className={cn(
                  `${col.width} px-4 py-3`,
                  `text-${col.align}`,
                  "text-[10px] uppercase tracking-[0.18em] text-cream-mute font-medium"
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = yieldTone(row.yieldPct);
            const yieldColor =
              tone === "good"
                ? "text-electric-soft"
                : tone === "warn"
                ? "text-vibrant-soft"
                : "text-hotpink-soft";
            const lossColor = row.lossAmt > 0 ? "text-hotpink-soft" : "text-electric-soft";

            return (
              <tr
                key={row.id}
                className="border-b border-cocoa-800/60 hover:bg-cocoa-900/50 transition-colors"
              >
                {/* Material / Vendor */}
                <td className="px-4 py-3">
                  <p className="font-medium text-cream">{row.material}</p>
                  <p className="text-[10px] text-cream-mute mt-0.5">{row.vendorName}</p>
                </td>

                {/* Date */}
                <td className="px-4 py-3 text-cream-dim">
                  {new Date(row.invoiceDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "2-digit",
                  })}
                </td>

                {/* Unit */}
                <td className="px-4 py-3 text-cream-mute">{row.unit}</td>

                {/* Stated qty */}
                <td className="px-4 py-3 text-right font-mono text-cream-dim">
                  {row.statedQty.toLocaleString()}
                </td>

                {/* Actual qty */}
                <td className="px-4 py-3 text-right font-mono text-cream">
                  {row.actualQty.toLocaleString()}
                </td>

                {/* Yield % */}
                <td className={cn("px-4 py-3 text-right font-mono font-semibold", yieldColor)}>
                  <span className="flex items-center justify-end gap-1">
                    {tone === "good" ? (
                      <TrendingUp className="size-3 inline-block" />
                    ) : (
                      <TrendingDown className="size-3 inline-block" />
                    )}
                    {row.yieldPct.toFixed(1)}%
                  </span>
                </td>

                {/* Invoiced $/unit */}
                <td className="px-4 py-3 text-right font-mono text-cream-dim">
                  {formatCurrency(row.invoicedUnitCost, { compact: false })}
                </td>

                {/* Effective $/unit */}
                <td className={cn("px-4 py-3 text-right font-mono font-semibold", yieldColor)}>
                  {formatCurrency(row.effectiveCost)}
                </td>

                {/* Hidden inflation */}
                <td className={cn("px-4 py-3 text-right font-mono font-semibold", yieldColor)}>
                  {row.hiddenInflationPct > 0 ? "+" : ""}
                  {formatPercent(row.hiddenInflationPct)}
                </td>

                {/* Total invoiced */}
                <td className="px-4 py-3 text-right font-mono text-cream-dim">
                  {formatCurrency(row.totalInvoiced)}
                </td>

                {/* Hidden loss */}
                <td className={cn("px-4 py-3 text-right font-mono font-bold", lossColor)}>
                  {row.lossAmt > 0 ? "+" : ""}
                  {formatCurrency(row.lossAmt)}
                </td>

                {/* Badge */}
                <td className="px-4 py-3 text-center">{yieldBadge(row.yieldPct)}</td>

                {/* Delete */}
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onDelete(row.id)}
                    className="text-cream-mute hover:text-hotpink transition-colors p-1 rounded-lg hover:bg-cocoa-800"
                    aria-label={`Delete ${row.material} row`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Summary footer */}
        {rows.length > 1 && (() => {
          const totalInvoiced = rows.reduce((s, r) => s + r.totalInvoiced, 0);
          const totalLoss = rows.reduce((s, r) => s + r.lossAmt, 0);
          const avgYield = rows.reduce((s, r) => s + r.yieldPct, 0) / rows.length;
          const avgHidden = rows.reduce((s, r) => s + r.hiddenInflationPct, 0) / rows.length;

          return (
            <tfoot>
              <tr className="bg-cocoa-900/60 border-t border-cocoa-700">
                <td colSpan={3} className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-cream-mute">
                  Totals / averages ({rows.length} rows)
                </td>
                <td colSpan={2} />
                <td className="px-4 py-3 text-right font-mono font-bold text-cream">
                  {avgYield.toFixed(1)}%
                </td>
                <td />
                <td />
                <td className="px-4 py-3 text-right font-mono font-bold text-cream-mute">
                  {formatPercent(avgHidden)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-cream">
                  {formatCurrency(totalInvoiced)}
                </td>
                <td className={cn(
                  "px-4 py-3 text-right font-mono font-bold",
                  totalLoss > 0 ? "text-hotpink-soft" : "text-electric-soft"
                )}>
                  {totalLoss > 0 ? "+" : ""}
                  {formatCurrency(totalLoss)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function YieldTrackerScreen() {
  const [entries, setEntries] = useState<YieldEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setEntries(JSON.parse(saved));
      } else {
        setEntries(DEMO_ENTRIES);
      }
    } catch {
      setEntries(DEMO_ENTRIES);
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {}
  }, [entries, loaded]);

  function handleAdd(entry: YieldEntry) {
    setEntries((prev) => [entry, ...prev]);
  }

  function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function resetToDemo() {
    setEntries(DEMO_ENTRIES);
  }

  const rows = entries.map(computeRow);

  // KPIs
  const avgYield = rows.length > 0
    ? rows.reduce((s, r) => s + r.yieldPct, 0) / rows.length
    : null;
  const totalHiddenLoss = rows.reduce((s, r) => s + (r.lossAmt > 0 ? r.lossAmt : 0), 0);
  const worstEntry = rows.length > 0
    ? rows.reduce((worst, r) => (r.yieldPct < worst.yieldPct ? r : worst))
    : null;
  const avgHiddenInflation = rows.length > 0
    ? rows.reduce((s, r) => s + r.hiddenInflationPct, 0) / rows.length
    : null;

  return (
    <div className="space-y-10">
      <ScreenHeader
        eyebrow={COPY.yield.eyebrow}
        headline={COPY.yield.headline}
        sub={COPY.yield.sub}
        trailing={
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => csvExport(rows)}>
                <Download className="size-3.5" />
                Export CSV
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={resetToDemo}>
              <RefreshCw className="size-3.5" />
              Load demo
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-5 shadow-card">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cream-mute">Avg yield</p>
          <p className={cn(
            "font-display text-3xl mt-2",
            avgYield === null ? "text-cream-mute" :
            avgYield >= 98 ? "text-electric-soft" :
            avgYield >= 93 ? "text-vibrant-soft" :
            "text-hotpink-soft"
          )}>
            {avgYield !== null ? `${avgYield.toFixed(1)}%` : "—"}
          </p>
          <p className="text-[10px] text-cream-mute mt-1">actual / stated</p>
        </div>

        <div className="rounded-3xl border border-hotpink/30 bg-cocoa-900/70 p-5 shadow-card relative overflow-hidden">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cream-mute">Total hidden loss</p>
          <p className="font-display text-3xl mt-2 text-hotpink-soft">
            {formatCurrency(totalHiddenLoss)}
          </p>
          <p className="text-[10px] text-cream-mute mt-1">effective over-cost</p>
        </div>

        <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-5 shadow-card">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cream-mute">Avg hidden inflation</p>
          <p className={cn(
            "font-display text-3xl mt-2",
            avgHiddenInflation === null ? "text-cream-mute" :
            avgHiddenInflation > 5 ? "text-hotpink-soft" :
            avgHiddenInflation > 2 ? "text-vibrant-soft" :
            "text-electric-soft"
          )}>
            {avgHiddenInflation !== null ? formatPercent(avgHiddenInflation) : "—"}
          </p>
          <p className="text-[10px] text-cream-mute mt-1">per-unit real overpay</p>
        </div>

        <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-5 shadow-card">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cream-mute">Worst delivery</p>
          <p className="font-display text-2xl mt-2 text-hotpink-soft leading-tight">
            {worstEntry ? `${worstEntry.yieldPct.toFixed(1)}%` : "—"}
          </p>
          <p className="text-[10px] text-cream-mute mt-1 truncate">
            {worstEntry ? worstEntry.material : "No entries yet"}
          </p>
        </div>
      </div>

      {/* Yield legend */}
      <div className="flex items-center gap-6 text-xs flex-wrap">
        <span className="text-cream-mute flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-electric inline-block" />
          ≥ 98% — Good yield
        </span>
        <span className="text-cream-mute flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-vibrant inline-block" />
          93–97.9% — Short-shipped
        </span>
        <span className="text-cream-mute flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-hotpink inline-block" />
          {"< 93%"} — Significant loss
        </span>
        <span className="ml-auto text-cream-mute flex items-center gap-1.5">
          <Info className="size-3.5" />
          Effective cost = invoiced $/unit ÷ yield%
        </span>
      </div>

      {/* Add form */}
      <AddRowForm onAdd={handleAdd} />

      {/* Table */}
      <YieldTable rows={rows} onDelete={handleDelete} />

      <div className="rounded-2xl border border-cocoa-700 bg-cocoa-900 px-5 py-4 flex items-start gap-3">
        <Info className="size-4 text-cream-mute mt-0.5 shrink-0" />
        <p className="text-xs text-cream-mute leading-relaxed">
          <strong className="text-cream-dim">How it works:</strong> Yield % = actual qty ÷ stated qty.
          Effective $/unit = invoiced $/unit ÷ yield%. Hidden inflation = (1 ÷ yield%) − 1.
          A 95% yield on a $10/unit material means you&apos;re actually paying $10.53/unit —
          a 5.3% hidden inflation rate on top of any vendor price change.
          Data is persisted locally in your browser. No API keys required.
        </p>
      </div>
    </div>
  );
}
