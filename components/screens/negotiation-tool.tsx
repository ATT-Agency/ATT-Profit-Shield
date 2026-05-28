"use client";

/**
 * Screen 06 — Vendor Price Negotiation Tool
 *
 * Scans tracked vendor inputs, flags price increases above FRED PPI benchmarks,
 * shows side-by-side math, and generates data-backed negotiation email drafts.
 *
 * Required env vars (for live FRED data):
 *   FRED_API_KEY  — St. Louis Fed API key (free, stlouisfed.org/docs/api/fred)
 *
 * Email-send integrations (implement when keys are available):
 *   SENDGRID_API_KEY     — or RESEND_API_KEY for transactional email
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS  — for SMTP relay
 *
 * In this implementation, FRED data is demo/static and email is copy-to-clipboard.
 */

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Mail,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Filter,
  ArrowUpRight,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/screen-header";
import { COPY } from "@/lib/copy";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type NegotiationStatus = "flagged" | "in-progress" | "resolved";
type FilterStatus = "all" | NegotiationStatus;

interface VendorEntry {
  id: string;
  vendorName: string;
  material: string;
  unit: string;
  contactName: string;
  contactEmail: string;
  // Pricing data
  baselineUnitCost: number;     // What you paid previously
  quotedUnitCost: number;       // What vendor is now charging
  quantity: number;
  // FRED benchmark
  fredCode: string;
  fredLabel: string;
  fredPpiYoyPct: number;        // What FRED says the index moved
  // State
  status: NegotiationStatus;
  dateQuoted: string;
}

// ── Demo data — replace with live Supabase + FRED fetch in production ──────────

const DEMO_VENDORS: VendorEntry[] = [
  {
    id: "v1",
    vendorName: "Apex Steel Fabricators",
    material: "Stainless Steel Rod (304)",
    unit: "unit",
    contactName: "Marcus Webb",
    contactEmail: "mwebb@apexsteel.example.com",
    baselineUnitCost: 480,
    quotedUnitCost: 522,
    quantity: 12,
    fredCode: "WPU101",
    fredLabel: "Steel & Iron PPI",
    fredPpiYoyPct: 3.1,
    status: "flagged",
    dateQuoted: "2025-05-14",
  },
  {
    id: "v2",
    vendorName: "Pacific Lumber Supply",
    material: "Structural Lumber (2×6 Doug Fir)",
    unit: "bd ft",
    contactName: "Rachel Kim",
    contactEmail: "rkim@pacluber.example.com",
    baselineUnitCost: 0.68,
    quotedUnitCost: 0.87,
    quantity: 8000,
    fredCode: "WPU081",
    fredLabel: "Lumber & Wood PPI",
    fredPpiYoyPct: 7.4,
    status: "flagged",
    dateQuoted: "2025-05-10",
  },
  {
    id: "v3",
    vendorName: "Diesel Direct LLC",
    material: "Ultra-Low Sulfur Diesel",
    unit: "gal",
    contactName: "Tom Garrison",
    contactEmail: "tgarrison@dieseldirect.example.com",
    baselineUnitCost: 4.05,
    quotedUnitCost: 4.88,
    quantity: 300,
    fredCode: "WPU057",
    fredLabel: "Fuel & Petroleum PPI",
    fredPpiYoyPct: 11.2,
    status: "in-progress",
    dateQuoted: "2025-05-08",
  },
  {
    id: "v4",
    vendorName: "Atlas Aluminum Works",
    material: "Aluminum Sheet (6061-T6)",
    unit: "lb",
    contactName: "Diana Santos",
    contactEmail: "dsantos@atlasalum.example.com",
    baselineUnitCost: 3.15,
    quotedUnitCost: 3.97,
    quantity: 650,
    fredCode: "WPU102501",
    fredLabel: "Aluminum Mill Shapes PPI",
    fredPpiYoyPct: 7.8,
    status: "flagged",
    dateQuoted: "2025-05-20",
  },
  {
    id: "v5",
    vendorName: "Prime Paper & Pack Co.",
    material: "Corrugated Cardboard Boxes",
    unit: "unit",
    contactName: "Steve Leung",
    contactEmail: "sleung@primepaper.example.com",
    baselineUnitCost: 1.42,
    quotedUnitCost: 1.58,
    quantity: 2400,
    fredCode: "WPU0911",
    fredLabel: "Paper & Packaging PPI",
    fredPpiYoyPct: 4.9,
    status: "resolved",
    dateQuoted: "2025-04-28",
  },
];

// ── Computed helpers ───────────────────────────────────────────────────────────

function computeEntry(v: VendorEntry) {
  const vendorChangePct = ((v.quotedUnitCost - v.baselineUnitCost) / v.baselineUnitCost) * 100;
  const overagePct = vendorChangePct - v.fredPpiYoyPct;
  const baselineTotal = v.baselineUnitCost * v.quantity;
  const quotedTotal = v.quotedUnitCost * v.quantity;
  const fredJustifiedTotal = v.baselineUnitCost * (1 + v.fredPpiYoyPct / 100) * v.quantity;
  const overageTotal = quotedTotal - fredJustifiedTotal;
  return { vendorChangePct, overagePct, baselineTotal, quotedTotal, fredJustifiedTotal, overageTotal };
}

// ── Email draft generator ──────────────────────────────────────────────────────

function generateEmailDraft(v: VendorEntry): string {
  const c = computeEntry(v);
  const companyName = "ATT Agency"; // Replace with user's company name from settings
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `Subject: Price Increase Discussion — ${v.material}

Dear ${v.contactName},

Thank you for your continued partnership with ${companyName}. I'm writing regarding the recent pricing update on ${v.material} (quoted on ${new Date(v.dateQuoted).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}).

THE DATA

Your proposed increase: ${formatPercent(c.vendorChangePct, 1)} (from ${formatCurrency(v.baselineUnitCost)}/${v.unit} → ${formatCurrency(v.quotedUnitCost)}/${v.unit})
FRED ${v.fredLabel} YoY change: ${formatPercent(v.fredPpiYoyPct, 1)}
Excess above index: ${formatPercent(c.overagePct, 1)}

At our current order volume of ${v.quantity.toLocaleString()} ${v.unit}s, your quote implies:
  - Quoted total: ${formatCurrency(c.quotedTotal)}
  - Index-justified cost: ${formatCurrency(c.fredJustifiedTotal)} (baseline + FRED ${v.fredLabel})
  - Unexplained overage: ${formatCurrency(c.overageTotal)}

THE ASK

The FRED ${v.fredLabel} — sourced directly from the St. Louis Federal Reserve — indicates ${formatPercent(v.fredPpiYoyPct, 1)} cost movement for this commodity category over the past 12 months. We fully understand that input costs change, and we are prepared to absorb cost increases that track with macro indices.

However, a ${formatPercent(c.vendorChangePct, 1)} increase is ${formatPercent(c.overagePct, 1)} above the published index. We'd like to request that you revisit the pricing to align closer to the index-justified figure of ${formatCurrency(v.baselineUnitCost * (1 + v.fredPpiYoyPct / 100))}/${v.unit}, or provide documentation of additional cost drivers that explain the gap.

We value this supply relationship and want to find a mutually workable arrangement. Could we schedule a brief call this week to discuss?

Best regards,
[Your Name]
${companyName}

---
Data source: St. Louis Federal Reserve FRED — ${v.fredLabel} (${v.fredCode})
Retrieved: ${today}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<NegotiationStatus, { label: string; tone: "danger" | "jackson" | "electric"; icon: React.FC<{ className?: string }> }> = {
  flagged: { label: "Flagged", tone: "danger", icon: AlertTriangle },
  "in-progress": { label: "In Progress", tone: "jackson", icon: Clock },
  resolved: { label: "Resolved", tone: "electric", icon: CheckCircle2 },
};

function MathBreakdown({ vendor }: { vendor: VendorEntry }) {
  const c = computeEntry(vendor);
  const isOverage = c.overagePct > 0;

  return (
    <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Vendor side */}
      <div className="rounded-2xl border border-cocoa-700 bg-cocoa-950 p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-cream-mute mb-3">Vendor quote</p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-cream-dim">Previous unit cost</span>
            <span className="font-mono text-cream">{formatCurrency(vendor.baselineUnitCost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-cream-dim">Quoted unit cost</span>
            <span className="font-mono text-cream">{formatCurrency(vendor.quotedUnitCost)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-cocoa-800 pt-2 mt-2">
            <span className="text-cream-dim">Vendor increase</span>
            <span className="font-mono font-semibold text-hotpink-soft">
              {formatPercent(c.vendorChangePct)} /{" "}
              {formatCurrency(vendor.quotedUnitCost - vendor.baselineUnitCost)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-cream-dim">Quantity × quoted</span>
            <span className="font-mono font-semibold text-cream">{formatCurrency(c.quotedTotal)}</span>
          </div>
        </div>
      </div>

      {/* FRED benchmark side */}
      <div className="rounded-2xl border border-electric/30 bg-cocoa-950 p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-cream-mute mb-3">
          FRED benchmark — {vendor.fredLabel}
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-cream-dim">PPI YoY change</span>
            <span className="font-mono text-electric-soft">{formatPercent(vendor.fredPpiYoyPct)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-cream-dim">Index-justified cost</span>
            <span className="font-mono text-cream">
              {formatCurrency(vendor.baselineUnitCost * (1 + vendor.fredPpiYoyPct / 100))}
            </span>
          </div>
          <div className="flex justify-between text-sm border-t border-cocoa-800 pt-2 mt-2">
            <span className="text-cream-dim">Index-justified total</span>
            <span className="font-mono font-semibold text-cream">{formatCurrency(c.fredJustifiedTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-cream-dim font-semibold">
              {isOverage ? "Unexplained overage" : "Vendor undercharge"}
            </span>
            <span
              className={cn(
                "font-mono font-bold",
                isOverage ? "text-hotpink-soft" : "text-electric-soft"
              )}
            >
              {isOverage ? "+" : ""}{formatCurrency(Math.abs(c.overageTotal))}
            </span>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="md:col-span-2 rounded-2xl border border-cocoa-700 bg-cocoa-900 p-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1">
          <p className="text-xs text-cream-mute">Vendor increase vs. FRED index</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2.5 rounded-full bg-cocoa-800 overflow-hidden relative">
              {/* FRED justified bar */}
              <div
                className="absolute inset-y-0 left-0 bg-electric-soft rounded-full"
                style={{
                  width: `${Math.min((vendor.fredPpiYoyPct / c.vendorChangePct) * 100, 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-electric-soft font-mono whitespace-nowrap">
              FRED {formatPercent(vendor.fredPpiYoyPct)}
            </span>
            <span className="text-xs text-hotpink-soft font-mono whitespace-nowrap">
              Vendor {formatPercent(c.vendorChangePct)}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cream-mute">Excess</p>
          <p
            className={cn(
              "font-display text-2xl",
              isOverage ? "text-hotpink-soft" : "text-electric-soft"
            )}
          >
            {isOverage ? "+" : ""}
            {formatPercent(c.overagePct)}
          </p>
        </div>
      </div>
    </div>
  );
}

function VendorCard({
  vendor,
  onStatusChange,
}: {
  vendor: VendorEntry;
  onStatusChange: (id: string, status: NegotiationStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const c = computeEntry(vendor);
  const cfg = STATUS_CONFIG[vendor.status];
  const StatusIcon = cfg.icon;
  const isOverage = c.overagePct > 0;

  function copyEmail() {
    navigator.clipboard.writeText(generateEmailDraft(vendor)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <article
      className={cn(
        "rounded-3xl border bg-cocoa-900/70 shadow-card transition-colors",
        vendor.status === "flagged"
          ? "border-hotpink/30"
          : vendor.status === "in-progress"
          ? "border-jackson/30"
          : "border-cocoa-700"
      )}
    >
      {/* Header row */}
      <div
        className="flex items-start gap-4 p-6 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-display text-xl text-cream">{vendor.vendorName}</h3>
            <Badge tone={cfg.tone}>
              <StatusIcon className="size-3 mr-1" />
              {cfg.label}
            </Badge>
          </div>
          <p className="text-sm text-cream-mute mt-0.5">
            {vendor.material} · {vendor.contactName} · Quoted {new Date(vendor.dateQuoted).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Quick numbers */}
        <div className="hidden md:flex items-center gap-6 text-right shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">Vendor Δ</p>
            <p className="font-mono font-semibold text-hotpink-soft">
              {formatPercent(c.vendorChangePct)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">FRED PPI</p>
            <p className="font-mono font-semibold text-electric-soft">
              {formatPercent(vendor.fredPpiYoyPct)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">Excess</p>
            <p
              className={cn(
                "font-mono font-bold text-lg",
                isOverage ? "text-hotpink-soft" : "text-electric-soft"
              )}
            >
              {isOverage ? "+" : ""}
              {formatPercent(c.overagePct)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">Overage $</p>
            <p className="font-mono font-bold text-lg text-cream">
              {isOverage ? formatCurrency(c.overageTotal) : "—"}
            </p>
          </div>
        </div>

        <button className="text-cream-mute p-1 shrink-0">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-6 pb-6 border-t border-cocoa-800 pt-5">
          {/* Math breakdown */}
          <MathBreakdown vendor={vendor} />

          {/* Actions */}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmail(!showEmail)}
            >
              <Mail className="size-3.5" />
              {showEmail ? "Hide" : "Draft"} negotiation email
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-cream-mute">Status:</span>
              {(["flagged", "in-progress", "resolved"] as NegotiationStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); onStatusChange(vendor.id, s); }}
                  className={cn(
                    "text-xs rounded-full px-3 py-1 border transition-colors",
                    vendor.status === s
                      ? "bg-cocoa-700 border-cocoa-600 text-cream"
                      : "border-cocoa-700 text-cream-mute hover:text-cream hover:border-cocoa-600"
                  )}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Email draft */}
          {showEmail && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-cream-mute">
                  Negotiation email draft
                </p>
                <Button variant="ghost" size="sm" onClick={copyEmail}>
                  <Copy className="size-3.5" />
                  {copied ? "Copied!" : "Copy to clipboard"}
                </Button>
              </div>
              <pre className="rounded-2xl border border-cocoa-700 bg-cocoa-950 px-5 py-4 text-xs text-cream-dim font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto">
                {generateEmailDraft(vendor)}
              </pre>
              <p className="text-xs text-cream-mute mt-2 flex items-center gap-1.5">
                <Info className="size-3.5" />
                Fill in [Your Name] before sending. To enable one-click send, configure{" "}
                <code className="text-vibrant-soft">SENDGRID_API_KEY</code> or{" "}
                <code className="text-vibrant-soft">RESEND_API_KEY</code>.
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function NegotiationToolScreen() {
  const [vendors, setVendors] = useState<VendorEntry[]>(DEMO_VENDORS);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<"overage" | "date">("overage");

  function updateStatus(id: string, status: NegotiationStatus) {
    setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, status } : v)));
  }

  const filtered = useMemo(() => {
    let list = filterStatus === "all" ? vendors : vendors.filter((v) => v.status === filterStatus);
    if (sortBy === "overage") {
      list = [...list].sort((a, b) => {
        const oa = computeEntry(a).overagePct;
        const ob = computeEntry(b).overagePct;
        return ob - oa;
      });
    } else {
      list = [...list].sort((a, b) => b.dateQuoted.localeCompare(a.dateQuoted));
    }
    return list;
  }, [vendors, filterStatus, sortBy]);

  // KPIs
  const totalOverage = vendors.reduce((s, v) => {
    const c = computeEntry(v);
    return s + (c.overageTotal > 0 ? c.overageTotal : 0);
  }, 0);
  const flaggedCount = vendors.filter((v) => v.status === "flagged").length;
  const avgExcess = (() => {
    const overageVendors = vendors.filter((v) => computeEntry(v).overagePct > 0);
    if (!overageVendors.length) return 0;
    return overageVendors.reduce((s, v) => s + computeEntry(v).overagePct, 0) / overageVendors.length;
  })();

  return (
    <div className="space-y-10">
      <ScreenHeader
        eyebrow={COPY.negotiate.eyebrow}
        headline={COPY.negotiate.headline}
        sub={COPY.negotiate.sub}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-3xl border border-hotpink/30 bg-cocoa-900/70 p-6 shadow-card relative overflow-hidden">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute">Total unexplained overage</p>
          <p className="font-display text-4xl mt-3 text-hotpink-soft">
            {formatCurrency(totalOverage)}
          </p>
          <p className="text-xs text-cream-mute mt-2">above FRED PPI-justified costs</p>
        </div>
        <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-6 shadow-card">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute">Vendors flagged</p>
          <p className="font-display text-4xl mt-3">{flaggedCount}</p>
          <p className="text-xs text-cream-mute mt-2">of {vendors.length} tracked vendors</p>
        </div>
        <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-6 shadow-card">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute">Avg excess above FRED</p>
          <p className="font-display text-4xl mt-3 text-hotpink-soft">{formatPercent(avgExcess)}</p>
          <p className="text-xs text-cream-mute mt-2">across over-priced vendors</p>
        </div>
      </div>

      {/* Filter / sort bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-cocoa-900 border border-cocoa-700 rounded-2xl p-1">
          {(["all", "flagged", "in-progress", "resolved"] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-medium transition-colors capitalize",
                filterStatus === f
                  ? "bg-cocoa-700 text-cream"
                  : "text-cream-mute hover:text-cream"
              )}
            >
              {f === "all"
                ? `All (${vendors.length})`
                : f === "in-progress"
                ? `In Progress (${vendors.filter((v) => v.status === f).length})`
                : `${STATUS_CONFIG[f].label} (${vendors.filter((v) => v.status === f).length})`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Filter className="size-3.5 text-cream-mute" />
          <span className="text-xs text-cream-mute">Sort:</span>
          <button
            onClick={() => setSortBy("overage")}
            className={cn(
              "text-xs px-3 py-1.5 rounded-xl border transition-colors",
              sortBy === "overage"
                ? "border-cocoa-600 bg-cocoa-800 text-cream"
                : "border-cocoa-700 text-cream-mute hover:text-cream"
            )}
          >
            Highest overage
          </button>
          <button
            onClick={() => setSortBy("date")}
            className={cn(
              "text-xs px-3 py-1.5 rounded-xl border transition-colors",
              sortBy === "date"
                ? "border-cocoa-600 bg-cocoa-800 text-cream"
                : "border-cocoa-700 text-cream-mute hover:text-cream"
            )}
          >
            Most recent
          </button>
        </div>
      </div>

      {/* Vendor inbox */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-cocoa-700 p-12 text-center">
            <CheckCircle2 className="size-8 text-electric-soft mx-auto mb-3" />
            <p className="text-cream-dim font-medium">No vendors matching this filter.</p>
            <p className="text-sm text-cream-mute mt-1">All vendor pricing is within FRED benchmarks.</p>
          </div>
        ) : (
          filtered.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              onStatusChange={updateStatus}
            />
          ))
        )}
      </div>

      <div className="rounded-2xl border border-cocoa-700 bg-cocoa-900 px-5 py-4 flex items-start gap-3">
        <Info className="size-4 text-cream-mute mt-0.5 shrink-0" />
        <p className="text-xs text-cream-mute leading-relaxed">
          Demo vendor data shown above. In production, vendor entries are populated from your
          tracked materials on Screen 02 and compared against live FRED PPI data via{" "}
          <code className="text-vibrant-soft">FRED_API_KEY</code>. Email drafts can be sent
          automatically by configuring <code className="text-vibrant-soft">SENDGRID_API_KEY</code>{" "}
          or <code className="text-vibrant-soft">RESEND_API_KEY</code>.
        </p>
      </div>
    </div>
  );
}
