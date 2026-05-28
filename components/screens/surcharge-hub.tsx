"use client";

/**
 * Screen 05 — Invoice Surcharge Integration Hub
 *
 * Connects billing platforms (Stripe / Square) to FRED PPI data
 * and applies variable surcharge line items based on tracked material cost drift.
 *
 * Real integrations require the following env vars (never hard-code secrets):
 *   STRIPE_SECRET_KEY        — Stripe restricted key with write:invoices scope
 *   STRIPE_PUBLISHABLE_KEY   — Stripe publishable key for front-end SDK
 *   SQUARE_ACCESS_TOKEN      — Square OAuth access token
 *   FRED_API_KEY             — St. Louis Fed API key (free, stlouisfed.org/docs/api/fred)
 */

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Zap,
  Receipt,
  TrendingUp,
  Info,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/screen-header";
import { COPY } from "@/lib/copy";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlatformId = "stripe" | "square";

interface Integration {
  id: PlatformId;
  label: string;
  description: string;
  docsUrl: string;
  requiredEnv: string[];
  logoChar: string;
  accentClass: string;
}

interface ConnectionState {
  stripe: "disconnected" | "connected" | "error";
  square: "disconnected" | "connected" | "error";
}

export interface InitialMaterial {
  id: string;
  materialName: string;
  fredCode: string;
  fredLabel: string;
  driftPct: number;
  baselineCost: number;
  quantity: number;
  unit: string;
}

interface MaterialLineItem {
  id: string;
  materialName: string;
  fredCode: string;
  fredLabel: string;
  driftPct: number;    // YoY PPI change (annualized)
  baselineCost: number;
  quantity: number;
  unit: string;
  surchargeEnabled: boolean;
  billingLabel: string;
  mappedPlatform: PlatformId | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INTEGRATIONS: Integration[] = [
  {
    id: "stripe",
    label: "Stripe",
    description: "Adds surcharge line items to Stripe invoices via the Invoice Items API.",
    docsUrl: "https://stripe.com/docs/api/invoiceitems",
    requiredEnv: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"],
    logoChar: "S",
    accentClass: "bg-electric/20 text-electric-soft border-electric/30",
  },
  {
    id: "square",
    label: "Square",
    description: "Creates adjustment line items in Square Invoices through the Invoices API.",
    docsUrl: "https://developer.squareup.com/reference/square/invoices-api",
    requiredEnv: ["SQUARE_ACCESS_TOKEN"],
    logoChar: "Sq",
    accentClass: "bg-jackson/20 text-jackson-soft border-jackson/30",
  },
];

// 90-day prorate factor applied to annualized FRED drift.
const NINETY_DAY_FACTOR = 90 / 365;

// ── Sub-components ─────────────────────────────────────────────────────────────

function IntegrationCard({
  integration,
  status,
  onConnect,
  onDisconnect,
}: {
  integration: Integration;
  status: "disconnected" | "connected" | "error";
  onConnect: (id: PlatformId) => void;
  onDisconnect: (id: PlatformId) => void;
}) {
  const [showEnv, setShowEnv] = useState(false);

  return (
    <div
      className={cn(
        "rounded-3xl border bg-cocoa-900/70 p-6 shadow-card transition-colors",
        status === "connected"
          ? "border-electric/40"
          : status === "error"
          ? "border-hotpink/40"
          : "border-cocoa-700"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "size-10 rounded-xl border flex items-center justify-center font-bold text-sm",
              integration.accentClass
            )}
          >
            {integration.logoChar}
          </div>
          <div>
            <p className="font-medium text-cream">{integration.label}</p>
            <p className="text-xs text-cream-mute">{integration.description}</p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 mt-0.5">
          {status === "connected" ? (
            <CheckCircle2 className="size-4 text-electric-soft" />
          ) : status === "error" ? (
            <AlertTriangle className="size-4 text-hotpink-soft" />
          ) : (
            <Circle className="size-4 text-cream-mute" />
          )}
          <Badge
            tone={
              status === "connected"
                ? "electric"
                : status === "error"
                ? "danger"
                : "neutral"
            }
          >
            {status === "connected"
              ? "Live"
              : status === "error"
              ? "Auth Error"
              : "Disconnected"}
          </Badge>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 flex-wrap">
        {status === "connected" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDisconnect(integration.id)}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="electric"
            size="sm"
            onClick={() => onConnect(integration.id)}
          >
            <Zap className="size-3.5" />
            Connect {integration.label}
          </Button>
        )}
        <a
          href={integration.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-cream-mute hover:text-cream transition-colors"
        >
          API docs <ExternalLink className="size-3" />
        </a>
        <button
          className="ml-auto text-xs text-cream-mute hover:text-cream transition-colors flex items-center gap-1"
          onClick={() => setShowEnv(!showEnv)}
        >
          Env vars
          {showEnv ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      </div>

      {showEnv && (
        <div className="mt-4 rounded-2xl border border-cocoa-700 bg-cocoa-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cream-mute mb-2">
            Required environment variables
          </p>
          <div className="space-y-1.5">
            {integration.requiredEnv.map((envVar) => (
              <div
                key={envVar}
                className="flex items-center justify-between rounded-xl bg-cocoa-900 px-3 py-2"
              >
                <code className="text-xs text-vibrant-soft font-mono">{envVar}</code>
                <span className="text-[10px] text-cream-mute uppercase tracking-wide">
                  not set
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-cream-mute mt-3 leading-relaxed">
            Set these in <code className="text-vibrant-soft">.dev.vars</code> (local Wrangler) or
            Cloudflare Pages → Settings → Environment Variables (production, encrypted).
            Never commit secrets to source control.
          </p>
        </div>
      )}
    </div>
  );
}

function LineItemRow({
  item,
  onToggle,
  onLabelChange,
  onPlatformChange,
  connections,
}: {
  item: MaterialLineItem;
  onToggle: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onPlatformChange: (id: string, platform: PlatformId | null) => void;
  connections: ConnectionState;
}) {
  // 90-day prorated exposure: annualized drift * (90/365) applied to baseline spend.
  const surchargeAmt =
    item.baselineCost * item.quantity * (item.driftPct / 100) * NINETY_DAY_FACTOR;
  const up = item.driftPct > 0;

  return (
    <tr className="border-b border-cocoa-800 hover:bg-cocoa-900/40 transition-colors group">
      {/* Enable toggle */}
      <td className="px-4 py-3 w-10">
        <button
          onClick={() => onToggle(item.id)}
          className={cn(
            "size-5 rounded border-2 flex items-center justify-center transition-colors",
            item.surchargeEnabled
              ? "bg-vibrant border-vibrant text-cocoa-950"
              : "border-cocoa-600 bg-transparent"
          )}
          aria-label={`${item.surchargeEnabled ? "Disable" : "Enable"} surcharge for ${item.materialName}`}
        >
          {item.surchargeEnabled && (
            <svg viewBox="0 0 10 8" className="size-3 fill-current">
              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </td>

      {/* Material */}
      <td className="px-4 py-3 min-w-[160px]">
        <p className="text-sm font-medium text-cream">{item.materialName}</p>
        <p className="text-[11px] text-cream-mute mt-0.5">{item.fredLabel}</p>
      </td>

      {/* FRED PPI drift */}
      <td className="px-4 py-3 text-right font-mono text-sm">
        <span className={up ? "text-hotpink-soft" : "text-electric-soft"}>
          {formatPercent(item.driftPct)} YoY
        </span>
      </td>

      {/* Surcharge $ (90-day prorated) */}
      <td className="px-4 py-3 text-right font-mono text-sm">
        <span className={item.surchargeEnabled ? "text-cream" : "text-cream-mute"}>
          {formatCurrency(surchargeAmt)}
        </span>
      </td>

      {/* Invoice label */}
      <td className="px-4 py-3 min-w-[260px]">
        <input
          className="w-full rounded-xl border border-cocoa-700 bg-cocoa-900 px-3 py-1.5 text-xs text-cream placeholder:text-cream-mute focus:outline-none focus:ring-1 focus:ring-vibrant focus:border-vibrant disabled:opacity-50"
          value={item.billingLabel}
          onChange={(e) => onLabelChange(item.id, e.target.value)}
          disabled={!item.surchargeEnabled}
        />
      </td>

      {/* Platform */}
      <td className="px-4 py-3 min-w-[140px]">
        <select
          className="w-full rounded-xl border border-cocoa-700 bg-cocoa-900 px-3 py-1.5 text-xs text-cream focus:outline-none focus:ring-1 focus:ring-vibrant disabled:opacity-50"
          value={item.mappedPlatform ?? ""}
          onChange={(e) =>
            onPlatformChange(item.id, (e.currentTarget.value as PlatformId) || null)
          }
          disabled={!item.surchargeEnabled}
        >
          <option value="">— no platform —</option>
          {INTEGRATIONS.map((intg) => (
            <option key={intg.id} value={intg.id} disabled={connections[intg.id] !== "connected"}>
              {intg.label} {connections[intg.id] !== "connected" ? "(disconnected)" : ""}
            </option>
          ))}
        </select>
      </td>

      {/* Status badge */}
      <td className="px-4 py-3">
        {!item.surchargeEnabled ? (
          <Badge tone="neutral">Off</Badge>
        ) : item.mappedPlatform && connections[item.mappedPlatform] === "connected" ? (
          <Badge tone="electric">Ready</Badge>
        ) : item.mappedPlatform ? (
          <Badge tone="danger">No auth</Badge>
        ) : (
          <Badge tone="outline">Unmapped</Badge>
        )}
      </td>
    </tr>
  );
}

// ── Invoice Preview ────────────────────────────────────────────────────────────

function InvoicePreview({ items }: { items: MaterialLineItem[] }) {
  const [copied, setCopied] = useState(false);
  const active = items.filter((i) => i.surchargeEnabled);
  const totalSurcharge = active.reduce(
    (s, i) =>
      s + i.baselineCost * i.quantity * (i.driftPct / 100) * NINETY_DAY_FACTOR,
    0
  );
  const baseTotal = items.reduce((s, i) => s + i.baselineCost * i.quantity, 0);
  const pct = baseTotal > 0 ? (totalSurcharge / baseTotal) * 100 : 0;

  const previewText = [
    "INVOICE LINE ITEMS — Surcharge Adjustments (90-day exposure)",
    "─".repeat(48),
    ...active.map((i) => {
      const amt =
        i.baselineCost * i.quantity * (i.driftPct / 100) * NINETY_DAY_FACTOR;
      return `${i.billingLabel.padEnd(40)} ${formatCurrency(amt).padStart(10)}`;
    }),
    "─".repeat(48),
    `${"TOTAL MATERIAL SURCHARGE".padEnd(40)} ${formatCurrency(totalSurcharge).padStart(10)}`,
    "",
    `Effective surcharge rate: ${formatPercent(pct)} of baseline material cost`,
    `Source: FRED PPI data — St. Louis Federal Reserve`,
  ].join("\n");

  function copyPreview() {
    navigator.clipboard.writeText(previewText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-7 shadow-card">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-vibrant">Invoice Preview</p>
          <h3 className="font-display text-2xl mt-1">Surcharge line items</h3>
          <p className="text-sm text-cream-mute mt-1">
            90-day prorated exposure pushed to your connected billing platform when you apply.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={copyPreview}>
          <Copy className="size-3.5" />
          {copied ? "Copied!" : "Copy text"}
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cocoa-700 p-8 text-center">
          <Receipt className="size-6 text-cream-mute mx-auto mb-2" />
          <p className="text-sm text-cream-mute">Enable at least one surcharge row to see the invoice preview.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-cocoa-700 bg-cocoa-950 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cocoa-800">
                <th className="text-left px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">
                  Description
                </th>
                <th className="text-right px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium w-24">
                  PPI Δ
                </th>
                <th className="text-right px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium w-28">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {active.map((item) => {
                const amt =
                  item.baselineCost *
                  item.quantity *
                  (item.driftPct / 100) *
                  NINETY_DAY_FACTOR;
                return (
                  <tr key={item.id} className="border-b border-cocoa-800/60">
                    <td className="px-5 py-3 text-cream">{item.billingLabel}</td>
                    <td className="px-5 py-3 text-right text-xs text-hotpink-soft font-mono">
                      {formatPercent(item.driftPct)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-cream">
                      {formatCurrency(amt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-cocoa-900/60">
                <td
                  colSpan={2}
                  className="px-5 py-4 text-sm font-semibold text-cream-dim"
                >
                  Total surcharge ({formatPercent(pct)} of baseline)
                </td>
                <td className="px-5 py-4 text-right font-mono font-bold text-cream text-base">
                  {formatCurrency(totalSurcharge)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {active.length > 0 && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-cocoa-700 bg-cocoa-900 px-4 py-3">
          <Info className="size-4 text-cream-mute mt-0.5 shrink-0" />
          <p className="text-xs text-cream-mute leading-relaxed">
            90-day exposure ={" "}
            <code className="text-vibrant-soft">
              baseline_cost × quantity × fred_ppi_yoy_delta × (90/365)
            </code>
            . Connect a billing platform above and ensure the FRED API key is configured to push
            these items automatically.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function SurchargeHubScreen({
  initialMaterials,
}: {
  initialMaterials: InitialMaterial[];
}) {
  const [connections, setConnections] = useState<ConnectionState>({
    stripe: "disconnected",
    square: "disconnected",
  });
  const [items, setItems] = useState<MaterialLineItem[]>([]);

  // Hydrate items from server-supplied live materials.
  useEffect(() => {
    const rows: MaterialLineItem[] = initialMaterials.map((m) => ({
      id: m.id,
      materialName: m.materialName,
      fredCode: m.fredCode,
      fredLabel: m.fredLabel,
      driftPct: m.driftPct,
      baselineCost: m.baselineCost,
      quantity: m.quantity,
      unit: m.unit,
      surchargeEnabled: m.driftPct > 0,
      billingLabel: `Material Surcharge — ${m.materialName} (FRED PPI ${formatPercent(
        m.driftPct
      )})`,
      mappedPlatform: null,
    }));
    setItems(rows);
  }, [initialMaterials]);

  // Persist connection state in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ps:surcharge:connections");
      if (saved) setConnections(JSON.parse(saved));
    } catch {}
  }, []);

  function saveConnections(next: ConnectionState) {
    setConnections(next);
    try {
      localStorage.setItem("ps:surcharge:connections", JSON.stringify(next));
    } catch {}
  }

  function handleConnect(id: PlatformId) {
    saveConnections({ ...connections, [id]: "connected" });
  }

  function handleDisconnect(id: PlatformId) {
    saveConnections({ ...connections, [id]: "disconnected" });
    setItems((prev) =>
      prev.map((i) =>
        i.mappedPlatform === id ? { ...i, mappedPlatform: null } : i
      )
    );
  }

  function toggleSurcharge(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, surchargeEnabled: !i.surchargeEnabled } : i))
    );
  }

  function updateLabel(id: string, label: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, billingLabel: label } : i))
    );
  }

  function updatePlatform(id: string, platform: PlatformId | null) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, mappedPlatform: platform } : i))
    );
  }

  const totalActive = items.filter((i) => i.surchargeEnabled).length;
  const totalSurcharge = items
    .filter((i) => i.surchargeEnabled)
    .reduce(
      (s, i) =>
        s + i.baselineCost * i.quantity * (i.driftPct / 100) * NINETY_DAY_FACTOR,
      0
    );
  const connectedCount = Object.values(connections).filter((v) => v === "connected").length;

  return (
    <div className="space-y-10">
      <ScreenHeader
        eyebrow={COPY.surcharge.eyebrow}
        headline={COPY.surcharge.headline}
        sub={COPY.surcharge.sub}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-6 shadow-card">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute">Platforms connected</p>
          <p className="font-display text-4xl mt-3">{connectedCount} / 2</p>
          <p className="text-xs text-cream-mute mt-2">Stripe, Square</p>
        </div>
        <div className="rounded-3xl border border-vibrant/40 bg-cocoa-900/70 p-6 shadow-card">
          <div className="absolute -top-12 -right-12 size-36 rounded-full bg-vibrant/10 blur-2xl pointer-events-none" />
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute">Active surcharge items</p>
          <p className="font-display text-4xl mt-3">{totalActive}</p>
          <p className="text-xs text-cream-mute mt-2">of {items.length} tracked materials</p>
        </div>
        <div className="rounded-3xl border border-hotpink/30 bg-cocoa-900/70 p-6 shadow-card relative overflow-hidden">
          <p className="text-[11px] uppercase tracking-[0.22em] text-cream-mute">90-day billable exposure</p>
          <p className="font-display text-4xl mt-3 text-hotpink-soft">{formatCurrency(totalSurcharge)}</p>
          <p className="text-xs text-cream-mute mt-2">across enabled line items</p>
        </div>
      </div>

      {/* Integration cards */}
      <section>
        <h2 className="font-display text-2xl mb-4">Platform connections</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {INTEGRATIONS.map((intg) => (
            <IntegrationCard
              key={intg.id}
              integration={intg}
              status={connections[intg.id]}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      </section>

      {/* Material mapping table */}
      <section>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-2xl">Material → billing line items</h2>
            <p className="text-sm text-cream-mute mt-1">
              Toggle which cost inputs generate invoice surcharges, customize the billing label,
              and map to a connected platform.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-cream-mute bg-cocoa-900 border border-cocoa-700 rounded-2xl px-4 py-2">
            <TrendingUp className="size-3.5 text-vibrant" />
            Live FRED PPI YoY deltas
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-cocoa-700 p-12 text-center">
            <Receipt className="size-8 text-cream-mute mx-auto mb-3 opacity-50" />
            <p className="text-cream-dim font-medium">No tracked materials yet.</p>
            <p className="text-sm text-cream-mute mt-1">
              Add inputs on the Cost Inputs screen to populate surcharge line items.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cocoa-800">
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">
                    Material
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">
                    FRED PPI Δ
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">
                    90-day $
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">
                    Invoice label
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">
                    Platform
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    onToggle={toggleSurcharge}
                    onLabelChange={updateLabel}
                    onPlatformChange={updatePlatform}
                    connections={connections}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invoice preview */}
      <InvoicePreview items={items} />
    </div>
  );
}
