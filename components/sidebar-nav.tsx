"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes, LineChart, Wallet, MessageSquare, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { COPY } from "@/lib/copy";

const links = [
  { href: "/", label: COPY.nav.leaks, icon: Wallet, code: "01" },
  { href: "/materials", label: COPY.nav.materials, icon: Boxes, code: "02" },
  { href: "/inflation", label: COPY.nav.inflation, icon: Activity, code: "03" },
  { href: "/forecast", label: COPY.nav.forecast, icon: LineChart, code: "04" },
  { href: "/negotiate", label: "Vendor Negotiation", icon: MessageSquare, code: "05" },
  { href: "/yield", label: "Yield Tracker", icon: Scale, code: "06" }
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="px-4 py-6 flex-1 space-y-1">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-colors",
              active
                ? "bg-cocoa-800 text-cream"
                : "text-cream-dim hover:text-cream hover:bg-cocoa-900"
            )}
          >
            <span
              className={cn(
                "size-9 rounded-xl flex items-center justify-center border border-cocoa-700",
                active ? "bg-vibrant text-cocoa-950 border-vibrant" : "bg-cocoa-900 text-cream-mute"
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="flex-1">
              <span className="block text-[10px] uppercase tracking-[0.22em] text-cream-mute">
                Screen {l.code}
              </span>
              <span className="block font-medium">{l.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
