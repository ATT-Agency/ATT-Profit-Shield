"use client";

/**
 * Screen 05 — Invoice Surcharge Integration Hub
 *
 * Connects billing platforms (Stripe / Square) to FRED PPI data and applies
 * variable surcharge line items based on tracked material cost drift.
 *
 * Connect buttons now kick off a per-user OAuth handshake against
 * /api/auth/{platform}/connect — tokens are AES-GCM encrypted and stored on
 * public.platform_connections. No global API keys are used to access tenant
 * data; the platform secret is only ever touched server-side during the
 * one-shot OAuth code exchange.
 *
 * Platform env vars (server-side, set in Cloudflare Pages):
 *   STRIPE_SECRET_KEY            — platform-level, OAuth token exchange only
 *   STRIPE_CLIENT_ID             — Connect application id (ca_…)
 *   SQUARE_APPLICATION_ID        — Square Developer Dashboard app id
 *   SQUARE_APPLICATION_SECRET    — Square Developer Dashboard app secret
 *   SQUARE_ENVIRONMENT           — "production" (default) or "sandbox"
 *   ENCRYPTION_MASTER_KEY        — 32-byte hex for at-rest token encryption
 *   FRED_API_KEY                 — drives the surcharge amount via PPI YoY
 */

import { useState, useEffect, useCallback, useRef } from "react";
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
  Loader2,
  Send,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/screen-header";
import { COPY } from "@/lib/copy";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlatformId = "stripe" | "square";
type ConnStatus = "disconnected" | "connecting" | "connected" | "error";

interface Integration {
  id: PlatformId;
  label: string;
  description: string;
  docsUrl: string;
  requiredEnv: string[];
  logoChar: string;
  accentClass: string;
}

interface PlatformState {
  status: ConnStatus;
  accountName: string | null;
  error: string | null;
  // Square-only: list of locations the merchant can push to
  locations: Array<{ id: string; name: string }>;
  selectedLocationId: string | null;
}

type ConnectionMap = Record<PlatformId, PlatformState>;

interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
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
  /** public.surcharge_mappings.id — null until the row has been persisted. */
  mappingId: string | null;
  materialName: string;
  fredCode: string;
  fredLabel: string;
  driftPct: number;
  baselineCost: number;
  quantity: number;
  unit: string;
  surchargeEnabled: boolean;
  billingLabel: string;
  mappedPlatform: PlatformId | null;
}

/** Mirrors the public.surcharge_mappings row shape returned by GET /api/surcharge/mappings. */
type SavedSurchargeMapping = {
  id: string;
  material_id: string | null;
  material_name: string;
  fred_code: string | null;
  fred_label: string | null;
  billing_label: string;
  surcharge_enabled: boolean;
  mapped_platform: "stripe" | "square" | "quickbooks" | null;
  last_fred_pct: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

interface PushResult {
  platform: PlatformId;
  ok: boolean;
  message: string;
  link?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INTEGRATIONS: Integration[] = [
  {
    id: "stripe",
    label: "Stripe",
    description: "Adds surcharge line items to Stripe invoices via the Invoice Items API.",
    docsUrl: "https://stripe.com/docs/api/invoiceitems",
    requiredEnv: ["STRIPE_CLIENT_ID", "STRIPE_SECRET_KEY"],
    logoChar: "S",
    accentClass: "bg-electric/20 text-electric-soft border-electric/30",
  },
  {
    id: "square",
    label: "Square",
    description: "Creates draft Invoices on Square Orders via the Invoices API.",
    docsUrl: "https://developer.squareup.com/reference/square/invoices-api",
    requiredEnv: ["SQUARE_APPLICATION_ID", "SQUARE_APPLICATION_SECRET"],
    logoChar: "Sq",
    accentClass: "bg-jackson/20 text-jackson-soft border-jackson/30",
  },
];

const NINETY_DAY_FACTOR = 90 / 365;

const INITIAL_STATE: ConnectionMap = {
  stripe: { status: "disconnected", accountName: null, error: null, locations: [], selectedLocationId: null },
  square: { status: "disconnected", accountName: null, error: null, locations: [], selectedLocationId: null },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function IntegrationCard({
  integration,
  state,
  onConnect,
  onDisconnect,
  onSelectLocation,
}: {
  integration: Integration;
  state: PlatformState;
  onConnect: (id: PlatformId) => void;
  onDisconnect: (id: PlatformId) => void;
  onSelectLocation: (id: PlatformId, locationId: string) => void;
}) {
  const [showEnv, setShowEnv] = useState(false);
  const status = state.status;

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
            {state.accountName && status === "connected" ? (
              <p className="text-[11px] text-electric-soft mt-1">
                Connected · {state.accountName}
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 mt-0.5">
          {status === "connected" ? (
            <CheckCircle2 className="size-4 text-electric-soft" />
          ) : status === "error" ? (
            <AlertTriangle className="size-4 text-hotpink-soft" />
          ) : status === "connecting" ? (
            <Loader2 className="size-4 text-cream-mute animate-spin" />
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
              : status === "connecting"
              ? "Validating…"
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
            disabled={status === "connecting"}
          >
            {status === "connecting" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Zap className="size-3.5" />
            )}
            {status === "connecting" ? "Validating…" : `Connect ${integration.label}`}
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

      {/* Square-only: location picker (required to create Orders) */}
      {integration.id === "square" && status === "connected" && state.locations.length > 0 && (
        <div className="mt-4 rounded-2xl border border-cocoa-700 bg-cocoa-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cream-mute mb-2">
            Push to location
          </p>
          <select
            value={state.selectedLocationId ?? ""}
            onChange={(e) => onSelectLocation("square", e.currentTarget.value)}
            className="w-full rounded-xl border border-cocoa-700 bg-cocoa-900 px-3 py-2 text-xs text-cream focus:outline-none focus:ring-1 focus:ring-vibrant"
          >
            {state.locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      {state.error && (
        <div className="mt-3 rounded-xl border border-hotpink/30 bg-hotpink/10 px-3 py-2">
          <p className="text-xs text-hotpink-soft leading-snug">{state.error}</p>
        </div>
      )}

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
                  resolved server-side
                </span>
              </div>
            ))}
          </div>
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
  connections: ConnectionMap;
}) {
  const surchargeAmt =
    item.baselineCost * item.quantity * (item.driftPct / 100) * NINETY_DAY_FACTOR;
  const up = item.driftPct > 0;

  return (
    <tr className="border-b border-cocoa-800 hover:bg-cocoa-900/40 transition-colors group">
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

      <td className="px-4 py-3 min-w-[160px]">
        <p className="text-sm font-medium text-cream">{item.materialName}</p>
        <p className="text-[11px] text-cream-mute mt-0.5">{item.fredLabel}</p>
      </td>

      <td className="px-4 py-3 text-right font-mono text-sm">
        <span className={up ? "text-hotpink-soft" : "text-electric-soft"}>
          {formatPercent(item.driftPct)} YoY
        </span>
      </td>

      <td className="px-4 py-3 text-right font-mono text-sm">
        <span className={item.surchargeEnabled ? "text-cream" : "text-cream-mute"}>
          {formatCurrency(surchargeAmt)}
        </span>
      </td>

      <td className="px-4 py-3 min-w-[260px]">
        <input
          className="w-full rounded-xl border border-cocoa-700 bg-cocoa-900 px-3 py-1.5 text-xs text-cream placeholder:text-cream-mute focus:outline-none focus:ring-1 focus:ring-vibrant focus:border-vibrant disabled:opacity-50"
          value={item.billingLabel}
          onChange={(e) => onLabelChange(item.id, e.target.value)}
          disabled={!item.surchargeEnabled}
        />
      </td>

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
            <option key={intg.id} value={intg.id} disabled={connections[intg.id].status !== "connected"}>
              {intg.label} {connections[intg.id].status !== "connected" ? "(disconnected)" : ""}
            </option>
          ))}
        </select>
      </td>

      <td className="px-4 py-3">
        {!item.surchargeEnabled ? (
          <Badge tone="neutral">Off</Badge>
        ) : item.mappedPlatform && connections[item.mappedPlatform].status === "connected" ? (
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

// ── Push panel: pick customer per platform, then push ──────────────────────────

function PushPanel({
  items,
  connections,
  onPushResult,
}: {
  items: MaterialLineItem[];
  connections: ConnectionMap;
  onPushResult: (r: PushResult) => void;
}) {
  const [customers, setCustomers] = useState<Record<PlatformId, CustomerOption[]>>({
    stripe: [],
    square: [],
  });
  const [selectedCustomer, setSelectedCustomer] = useState<Record<PlatformId, string>>({
    stripe: "",
    square: "",
  });
  const [loadingCustomers, setLoadingCustomers] = useState<Record<PlatformId, boolean>>({
    stripe: false,
    square: false,
  });
  const [pushing, setPushing] = useState<Record<PlatformId, boolean>>({
    stripe: false,
    square: false,
  });
  // Free-text search per platform, fed straight into the `?query=` parameter
  // on /api/{platform}/customers. Empty string falls back to the default
  // 25-most-recent list; any non-empty query routes through Stripe's
  // customers.search and Square's /customers/search endpoints.
  const [searchQuery, setSearchQuery] = useState<Record<PlatformId, string>>({
    stripe: "",
    square: "",
  });

  const loadCustomers = useCallback(
    async (platform: PlatformId, query: string = "") => {
      setLoadingCustomers((p) => ({ ...p, [platform]: true }));
      try {
        const url = query
          ? `/api/${platform}/customers?query=${encodeURIComponent(query)}`
          : `/api/${platform}/customers`;
        const res = await fetch(url);
        const data = await res.json();
        setCustomers((p) => ({ ...p, [platform]: data.customers ?? [] }));
      } catch {
        setCustomers((p) => ({ ...p, [platform]: [] }));
      } finally {
        setLoadingCustomers((p) => ({ ...p, [platform]: false }));
      }
    },
    []
  );

  // Debounced fetch: re-runs whenever the platform connects OR the search
  // query changes. 300ms quiet period absorbs typing bursts without firing
  // a network request on every keystroke.
  useEffect(() => {
    if (connections.stripe.status !== "connected") return;
    const t = setTimeout(() => loadCustomers("stripe", searchQuery.stripe), 300);
    return () => clearTimeout(t);
  }, [connections.stripe.status, searchQuery.stripe, loadCustomers]);

  useEffect(() => {
    if (connections.square.status !== "connected") return;
    const t = setTimeout(() => loadCustomers("square", searchQuery.square), 300);
    return () => clearTimeout(t);
  }, [connections.square.status, searchQuery.square, loadCustomers]);

  async function pushToPlatform(platform: PlatformId) {
    const enabled = items.filter(
      (i) => i.surchargeEnabled && i.mappedPlatform === platform
    );
    if (enabled.length === 0) {
      onPushResult({ platform, ok: false, message: `No items mapped to ${platform}` });
      return;
    }
    const customerId = selectedCustomer[platform];
    if (!customerId) {
      onPushResult({ platform, ok: false, message: `Pick a ${platform} customer first` });
      return;
    }
    if (platform === "square" && !connections.square.selectedLocationId) {
      onPushResult({ platform, ok: false, message: "Pick a Square location first" });
      return;
    }

    setPushing((p) => ({ ...p, [platform]: true }));
    try {
      const lineItems = enabled.map((i) => ({
        description: i.billingLabel,
        amountCents: Math.round(
          i.baselineCost * i.quantity * (i.driftPct / 100) * NINETY_DAY_FACTOR * 100
        ),
        currency: "usd",
        metadata: { material: i.materialName, fredCode: i.fredCode },
      }));

      const body =
        platform === "stripe"
          ? { customerId, items: lineItems, createInvoice: true }
          : {
              customerId,
              locationId: connections.square.selectedLocationId,
              items: lineItems.map((i) => ({ ...i, currency: "USD" })),
            };

      const res = await fetch(`/api/${platform}/push-surcharges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.pushed) {
        const link =
          platform === "stripe"
            ? data.invoice?.hostedUrl ?? null
            : data.publicUrl ?? null;
        onPushResult({
          platform,
          ok: true,
          message:
            platform === "stripe"
              ? `Created ${data.itemsCreated} invoice item${data.itemsCreated === 1 ? "" : "s"}${data.invoice ? ` + draft invoice ${data.invoice.id}` : ""}`
              : `Created Square invoice ${data.invoiceId}`,
          link,
        });
      } else {
        onPushResult({
          platform,
          ok: false,
          message: data.error ?? "Push failed",
        });
      }
    } catch (err: any) {
      onPushResult({
        platform,
        ok: false,
        message: err?.message ?? "Network error pushing surcharges",
      });
    } finally {
      setPushing((p) => ({ ...p, [platform]: false }));
    }
  }

  const connectedPlatforms = (["stripe", "square"] as PlatformId[]).filter(
    (p) => connections[p].status === "connected"
  );
  if (connectedPlatforms.length === 0) return null;

  return (
    <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/70 p-6 shadow-card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-vibrant">Push to billing</p>
          <h3 className="font-display text-xl mt-1">Send surcharge items to a customer</h3>
          <p className="text-sm text-cream-mute mt-1">
            Picks the customer in your billing platform, creates the surcharge line items, and (Stripe) opens a draft invoice.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectedPlatforms.map((platform) => {
          const intg = INTEGRATIONS.find((i) => i.id === platform)!;
          const opts = customers[platform];
          const mappedCount = items.filter(
            (i) => i.surchargeEnabled && i.mappedPlatform === platform
          ).length;
          return (
            <div key={platform} className="rounded-2xl border border-cocoa-700 bg-cocoa-950 p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "size-7 rounded-lg border flex items-center justify-center font-bold text-[11px]",
                      intg.accentClass
                    )}
                  >
                    {intg.logoChar}
                  </div>
                  <p className="font-medium text-cream text-sm">{intg.label}</p>
                </div>
                <button
                  onClick={() => loadCustomers(platform, searchQuery[platform])}
                  className="text-[10px] text-cream-mute hover:text-cream flex items-center gap-1"
                  disabled={loadingCustomers[platform]}
                >
                  {loadingCustomers[platform] ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Refresh
                </button>
              </div>

              <label className="text-[10px] uppercase tracking-[0.18em] text-cream-mute">
                Search
              </label>
              <input
                type="search"
                value={searchQuery[platform]}
                onChange={(e) =>
                  setSearchQuery((p) => ({
                    ...p,
                    [platform]: e.currentTarget.value,
                  }))
                }
                placeholder="Name or email…"
                className="mt-1 w-full rounded-xl border border-cocoa-700 bg-cocoa-900 px-3 py-2 text-xs text-cream placeholder:text-cream-mute focus:outline-none focus:ring-1 focus:ring-vibrant"
              />

              <label className="mt-3 block text-[10px] uppercase tracking-[0.18em] text-cream-mute">
                Customer
              </label>
              <select
                value={selectedCustomer[platform]}
                onChange={(e) =>
                  setSelectedCustomer((p) => ({ ...p, [platform]: e.currentTarget.value }))
                }
                className="mt-1 w-full rounded-xl border border-cocoa-700 bg-cocoa-900 px-3 py-2 text-xs text-cream focus:outline-none focus:ring-1 focus:ring-vibrant"
              >
                <option value="">— pick customer —</option>
                {opts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.email ? `· ${c.email}` : ""}
                  </option>
                ))}
              </select>
              {opts.length === 0 && !loadingCustomers[platform] ? (
                <p className="text-[10px] text-cream-mute mt-1">
                  {searchQuery[platform]
                    ? `No matches for "${searchQuery[platform]}". Try a shorter fragment.`
                    : `No customers found. Create one in your ${intg.label} dashboard first.`}
                </p>
              ) : null}

              <Button
                size="sm"
                variant="electric"
                className="mt-4 w-full justify-center"
                onClick={() => pushToPlatform(platform)}
                disabled={
                  pushing[platform] ||
                  !selectedCustomer[platform] ||
                  mappedCount === 0 ||
                  (platform === "square" && !connections.square.selectedLocationId)
                }
              >
                {pushing[platform] ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {pushing[platform]
                  ? "Pushing…"
                  : `Push ${mappedCount} item${mappedCount === 1 ? "" : "s"} to ${intg.label}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Invoice Preview (text-only, for copy/paste outside billing flow) ───────────

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
            90-day prorated exposure. Use Push to Billing above to send to Stripe/Square, or copy the text for offline use.
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
                <td colSpan={2} className="px-5 py-4 text-sm font-semibold text-cream-dim">
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
    </div>
  );
}

// ── Push results toast strip ───────────────────────────────────────────────────

function PushResultsStrip({ results, onDismiss }: { results: PushResult[]; onDismiss: (idx: number) => void }) {
  if (results.length === 0) return null;
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <div
          key={i}
          className={cn(
            "rounded-2xl border px-4 py-3 flex items-start gap-3",
            r.ok
              ? "border-electric/40 bg-electric/10"
              : "border-hotpink/40 bg-hotpink/10"
          )}
        >
          {r.ok ? (
            <CheckCircle2 className="size-4 text-electric-soft shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="size-4 text-hotpink-soft shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-cream">
              <span className="capitalize">{r.platform}</span> · {r.message}
            </p>
            {r.link && (
              <a
                href={r.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-electric-soft hover:underline inline-flex items-center gap-1 mt-1"
              >
                Open in dashboard <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <button
            onClick={() => onDismiss(i)}
            className="text-cream-mute hover:text-cream text-xs"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function SurchargeHubScreen({
  initialMaterials,
}: {
  initialMaterials: InitialMaterial[];
}) {
  const [connections, setConnections] = useState<ConnectionMap>(INITIAL_STATE);
  const [items, setItems] = useState<MaterialLineItem[]>([]);
  const [pushResults, setPushResults] = useState<PushResult[]>([]);
  const [fredRefreshing, setFredRefreshing] = useState(false);

  // Synchronous mirror of `items` so handlers fired in quick succession
  // (rapid clicks, paste-typed labels) read the latest pre-render state
  // without waiting for React's commit phase.
  const itemsRef = useRef<MaterialLineItem[]>([]);
  // Per-material POST chain — guarantees the first INSERT lands (and we
  // capture its returned mappingId) before any subsequent UPDATE fires,
  // even if the user rapid-fires toggle/label/platform edits.
  const savePromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  // Per-material mapping id ref, refreshed synchronously when the first
  // INSERT returns. React state is the source of truth for rendering;
  // this ref is the source of truth for the next outbound POST.
  const mappingIdsRef = useRef<Map<string, string>>(new Map());
  // Per-material debounce timers for billing-label keystrokes.
  const labelDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  // Keep itemsRef synced with React state for paths that mutate items
  // through the prev-callback form (e.g. fetchFredData, handleDisconnect).
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  async function fetchFredData() {
    const codes = Array.from(
      new Set(items.map((i) => i.fredCode).filter(Boolean))
    );
    if (codes.length === 0) return;
    setFredRefreshing(true);
    try {
      const res = await fetch(`/api/surcharge/fred?codes=${codes.join(",")}`);
      const data = await res.json() as { data?: Record<string, { deltaPct: number | null }> };
      if (data.data) {
        setItems((prev) =>
          prev.map((item) => {
            const fresh = data.data?.[item.fredCode]?.deltaPct;
            if (fresh == null) return item;
            return {
              ...item,
              driftPct: fresh,
              billingLabel: item.billingLabel.replace(
                /FRED PPI [+-]?[\d.]+%/,
                `FRED PPI ${fresh >= 0 ? "+" : ""}${fresh.toFixed(1)}%`
              ),
            };
          })
        );
      }
    } catch {}
    setFredRefreshing(false);
  }

  // Hydrate items: pull existing surcharge_mappings from Supabase and overlay
  // their saved billing_label / surcharge_enabled / mapped_platform onto the
  // server-supplied materials. Each material is also seeded with its mappingId
  // (null when no row has been persisted yet).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let saved: SavedSurchargeMapping[] = [];
      try {
        const res = await fetch("/api/surcharge/mappings");
        if (res.ok) {
          const data = (await res.json()) as {
            mappings?: SavedSurchargeMapping[];
          };
          saved = data.mappings ?? [];
        }
      } catch {
        // RLS denial or network error leaves `saved` empty — fall through to defaults.
      }
      if (cancelled) return;

      const byMaterial = new Map<string, SavedSurchargeMapping>();
      const idLookup = new Map<string, string>();
      for (const m of saved) {
        if (m.material_id) {
          byMaterial.set(m.material_id, m);
          idLookup.set(m.material_id, m.id);
        }
      }
      mappingIdsRef.current = idLookup;

      const rows: MaterialLineItem[] = initialMaterials.map((m) => {
        const s = byMaterial.get(m.id);
        const mappedPlatform: PlatformId | null =
          s?.mapped_platform === "stripe" || s?.mapped_platform === "square"
            ? s.mapped_platform
            : null;
        return {
          id: m.id,
          mappingId: s?.id ?? null,
          materialName: m.materialName,
          fredCode: m.fredCode,
          fredLabel: m.fredLabel,
          driftPct: m.driftPct,
          baselineCost: m.baselineCost,
          quantity: m.quantity,
          unit: m.unit,
          surchargeEnabled: s?.surcharge_enabled ?? m.driftPct > 0,
          billingLabel:
            s?.billing_label ??
            `Material Surcharge — ${m.materialName} (FRED PPI ${formatPercent(m.driftPct)})`,
          mappedPlatform,
        };
      });
      itemsRef.current = rows;
      setItems(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialMaterials]);

  // Restore non-secret connection metadata across reloads. We don't persist
  // the connected state itself — we re-validate on mount so the badge reflects
  // current key status, not a stale "true" from a previous session.
  //
  // If we just landed back from an OAuth round-trip, surface any error string
  // the callback redirected with and strip the query params so a refresh
  // doesn't replay them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeErr = params.get("stripe_error");
    const squareErr = params.get("square_error");
    if (stripeErr) {
      setPushResults((p) => [
        { platform: "stripe" as PlatformId, ok: false, message: `Connect failed — ${stripeErr}` },
        ...p,
      ].slice(0, 5));
    }
    if (squareErr) {
      setPushResults((p) => [
        { platform: "square" as PlatformId, ok: false, message: `Connect failed — ${squareErr}` },
        ...p,
      ].slice(0, 5));
    }
    if (
      params.has("stripe_error") ||
      params.has("square_error") ||
      params.has("stripe_connected") ||
      params.has("square_connected")
    ) {
      const clean = new URL(window.location.href);
      [
        "stripe_error",
        "square_error",
        "stripe_connected",
        "square_connected",
      ].forEach((k) => clean.searchParams.delete(k));
      window.history.replaceState({}, "", clean.toString());
    }

    void (async () => {
      for (const platform of ["stripe", "square"] as PlatformId[]) {
        await validatePlatform(platform);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function validatePlatform(platform: PlatformId) {
    setConnections((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], status: "connecting", error: null },
    }));
    try {
      const res = await fetch(`/api/${platform}/validate`, { method: "POST" });
      const data = await res.json();
      setConnections((prev) => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          status: data.connected ? "connected" : "error",
          accountName: data.accountName ?? null,
          error: data.connected ? null : data.error ?? "Validation failed",
          locations: platform === "square" ? data.locations ?? [] : prev[platform].locations,
          selectedLocationId:
            platform === "square"
              ? prev.square.selectedLocationId ?? data.locations?.[0]?.id ?? null
              : prev[platform].selectedLocationId,
        },
      }));
    } catch (err: any) {
      setConnections((prev) => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          status: "error",
          error: err?.message ?? "Network error",
        },
      }));
    }
  }

  // OAuth handoff: navigate to /api/auth/{platform}/connect, which 302s the
  // user to Stripe/Square. After approval they land back on /surcharge with
  // ?{platform}_connected=1, the success-effect below re-runs validate, and
  // the badge flips to "Live".
  function handleConnect(id: PlatformId) {
    window.location.href = `/api/auth/${id}/connect`;
  }

  function handleDisconnect(id: PlatformId) {
    setConnections((prev) => ({
      ...prev,
      [id]: { status: "disconnected", accountName: null, error: null, locations: [], selectedLocationId: null },
    }));
    setItems((prev) =>
      prev.map((i) => (i.mappedPlatform === id ? { ...i, mappedPlatform: null } : i))
    );
  }

  function handleSelectLocation(id: PlatformId, locationId: string) {
    setConnections((prev) => ({
      ...prev,
      [id]: { ...prev[id], selectedLocationId: locationId },
    }));
  }

  // POST the current snapshot of a material line item to
  // /api/surcharge/mappings. Saves are serialized per material so a fast
  // toggle-then-edit chain can't race two INSERTs and produce duplicates —
  // the first POST's returned id is cached in mappingIdsRef so the second
  // call sees an UPDATE.
  async function persistMapping(snapshot: MaterialLineItem) {
    const materialId = snapshot.id;
    const prev = savePromisesRef.current.get(materialId) ?? Promise.resolve();
    const next = prev.then(async () => {
      const existingId =
        mappingIdsRef.current.get(materialId) ?? snapshot.mappingId ?? null;
      try {
        const res = await fetch("/api/surcharge/mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existingId ?? undefined,
            material_id: snapshot.id,
            material_name: snapshot.materialName,
            fred_code: snapshot.fredCode || null,
            fred_label: snapshot.fredLabel || null,
            billing_label: snapshot.billingLabel,
            surcharge_enabled: snapshot.surchargeEnabled,
            mapped_platform: snapshot.mappedPlatform,
            last_fred_pct: snapshot.driftPct,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { mapping?: { id?: string } };
        const newId = data.mapping?.id;
        if (newId && !existingId) {
          mappingIdsRef.current.set(materialId, newId);
          setItems((curr) =>
            curr.map((i) =>
              i.id === materialId ? { ...i, mappingId: newId } : i
            )
          );
        }
      } catch {
        // Silent: a failed POST leaves the optimistic UI intact; the next
        // edit will retry the persist.
      }
    });
    savePromisesRef.current.set(materialId, next);
  }

  function toggleSurcharge(id: string) {
    const idx = itemsRef.current.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const updated: MaterialLineItem = {
      ...itemsRef.current[idx],
      surchargeEnabled: !itemsRef.current[idx].surchargeEnabled,
    };
    const next = [
      ...itemsRef.current.slice(0, idx),
      updated,
      ...itemsRef.current.slice(idx + 1),
    ];
    itemsRef.current = next;
    setItems(next);
    void persistMapping(updated);
  }

  function updateLabel(id: string, label: string) {
    const idx = itemsRef.current.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const updated: MaterialLineItem = {
      ...itemsRef.current[idx],
      billingLabel: label,
    };
    const next = [
      ...itemsRef.current.slice(0, idx),
      updated,
      ...itemsRef.current.slice(idx + 1),
    ];
    itemsRef.current = next;
    setItems(next);
    // Debounce keystrokes: 500ms after the last edit, persist.
    const existing = labelDebounceRef.current.get(id);
    if (existing) clearTimeout(existing);
    labelDebounceRef.current.set(
      id,
      setTimeout(() => {
        labelDebounceRef.current.delete(id);
        void persistMapping(updated);
      }, 500)
    );
  }

  function updatePlatform(id: string, platform: PlatformId | null) {
    const idx = itemsRef.current.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const updated: MaterialLineItem = {
      ...itemsRef.current[idx],
      mappedPlatform: platform,
    };
    const next = [
      ...itemsRef.current.slice(0, idx),
      updated,
      ...itemsRef.current.slice(idx + 1),
    ];
    itemsRef.current = next;
    setItems(next);
    void persistMapping(updated);
  }

  function recordPushResult(r: PushResult) {
    setPushResults((prev) => [r, ...prev].slice(0, 5));
  }

  function dismissResult(idx: number) {
    setPushResults((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalActive = items.filter((i) => i.surchargeEnabled).length;
  const totalSurcharge = items
    .filter((i) => i.surchargeEnabled)
    .reduce(
      (s, i) =>
        s + i.baselineCost * i.quantity * (i.driftPct / 100) * NINETY_DAY_FACTOR,
      0
    );
  const connectedCount = (["stripe", "square"] as PlatformId[]).filter(
    (p) => connections[p].status === "connected"
  ).length;

  return (
    <div className="space-y-10">
      <ScreenHeader
        eyebrow={COPY.surcharge.eyebrow}
        headline={COPY.surcharge.headline}
        sub={COPY.surcharge.sub}
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchFredData()}
            disabled={fredRefreshing}
            aria-label="Recompute FRED PPI data"
          >
            {fredRefreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Recompute now
          </Button>
        }
      />

      <PushResultsStrip results={pushResults} onDismiss={dismissResult} />

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
              state={connections[intg.id]}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSelectLocation={handleSelectLocation}
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
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">Material</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">FRED PPI Δ</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">90-day $</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">Invoice label</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">Platform</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-cream-mute font-medium">Status</th>
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

      {/* Push to billing */}
      <PushPanel items={items} connections={connections} onPushResult={recordPushResult} />

      {/* Plain-text invoice preview */}
      <InvoicePreview items={items} />

      <div className="rounded-2xl border border-cocoa-700 bg-cocoa-900 px-5 py-4 flex items-start gap-3">
        <Info className="size-4 text-cream-mute mt-0.5 shrink-0" />
        <p className="text-xs text-cream-mute leading-relaxed">
          Stripe creates Invoice Items + a draft invoice (you finalize from the Stripe dashboard).
          Square creates an Order + draft Invoice on the selected location (you send from the Square dashboard).
          Amounts are <code className="text-vibrant-soft">baseline × quantity × FRED_YoY × (90/365)</code>.
        </p>
      </div>
    </div>
  );
}
