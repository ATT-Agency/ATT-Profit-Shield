import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback streamed while /yield's server component awaits its initial
 * yield-entry fetch. Mirrors the structure of the resolved screen
 * (ScreenHeader, 4 KPI tiles, an add-row form panel, a filter strip,
 * and a data table) so the swap-in feels like the same surface
 * sharpening rather than a layout pop.
 */
export default function YieldLoading() {
  return (
    <div className="min-h-screen bg-cocoa-950 p-8 space-y-8">
      {/* ScreenHeader */}
      <div className="space-y-3">
        <Skeleton className="h-9 w-72 rounded-2xl" />
        <Skeleton className="h-4 w-96 rounded-xl bg-cocoa-800/40" />
      </div>

      {/* KPI tiles row — yield page renders four (Avg yield / Hidden loss YTD / Avg hidden inflation / Worst vendor) */}
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-3xl border border-cocoa-700 bg-cocoa-900/80 p-5 space-y-3"
          >
            <Skeleton className="h-3 w-24 rounded-md bg-cocoa-800/40" />
            <Skeleton className="h-9 w-28 rounded-2xl" />
            <Skeleton className="h-3 w-32 rounded-xl bg-cocoa-800/40" />
          </div>
        ))}
      </div>

      {/* Add-row form panel */}
      <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/80 p-6 space-y-4">
        <Skeleton className="h-3 w-28 rounded-md bg-cocoa-800/40" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16 rounded-md bg-cocoa-800/40" />
              <Skeleton className="h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <Skeleton className="h-9 w-24 rounded-2xl" />
      </div>

      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-28 rounded-2xl" />
        <Skeleton className="h-9 w-64 rounded-2xl" />
        <Skeleton className="h-9 w-48 rounded-2xl bg-cocoa-800/40" />
      </div>

      {/* Data table */}
      <div className="rounded-3xl border border-cocoa-700 bg-cocoa-900/80 p-7 space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48 rounded-2xl" />
          <Skeleton className="h-9 w-28 rounded-2xl" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-1/5 rounded-xl bg-cocoa-800/40" />
              <Skeleton className="h-4 w-1/6 rounded-xl bg-cocoa-800/40" />
              <Skeleton className="h-4 w-16 rounded-xl bg-cocoa-800/40" />
              <Skeleton className="h-4 w-20 rounded-xl bg-cocoa-800/40" />
              <Skeleton className="ml-auto h-4 w-16 rounded-xl bg-cocoa-800/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
