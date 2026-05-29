import { YieldTrackerScreen } from "@/components/screens/yield-tracker";

/**
 * Screen 06 — Usable Yield Tracker
 * Route: /yield
 *
 * No external API keys required — fully client-side computation.
 * Data is persisted to localStorage in the browser.
 *
 * To sync entries to Supabase, add a server action (see app/materials/actions.ts
 * for the pattern) and call it from YieldTrackerScreen's handleAdd function.
 */
export const runtime = "edge";

export default function YieldPage() {
  return <YieldTrackerScreen />;
}
