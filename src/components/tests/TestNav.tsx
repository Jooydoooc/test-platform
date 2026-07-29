"use client";

// Category menu bar for the Test Center. Segmented tabs that switch between the
// overview hub and the per-skill pages, highlighting the active route. Shown on
// the hub and every category page so students can move between skills without
// going back to the overview first.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, BookText, LayoutGrid, Type } from "lucide-react";

const TABS = [
  { href: "/tests", label: "Overview", icon: LayoutGrid },
  { href: "/tests/grammar", label: "Grammar", icon: Type },
  { href: "/tests/vocabulary", label: "Vocabulary", icon: BookOpen },
  { href: "/tests/reading", label: "Reading", icon: BookText },
] as const;

export function TestNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Test categories"
      className="-mx-1 flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              active
                ? "bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[0_8px_20px_-8px_rgba(90,63,202,0.6)]"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
