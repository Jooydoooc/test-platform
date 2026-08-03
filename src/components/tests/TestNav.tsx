"use client";

// Category menu bar for the Test Center. Segmented tabs that switch between the
// overview hub and the per-skill pages, highlighting the active route. Shown on
// the hub and every category page so students can move between skills without
// going back to the overview first.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, BookText, Headphones, LayoutGrid, Type } from "lucide-react";

const TABS = [
  { href: "/tests", label: "Overview", icon: LayoutGrid },
  { href: "/tests/grammar", label: "Grammar", icon: Type },
  { href: "/tests/vocabulary", label: "Vocabulary", icon: BookOpen },
  { href: "/tests/reading", label: "Reading", icon: BookText },
  { href: "/tests/listening", label: "Listening", icon: Headphones },
] as const;

export function TestNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Test categories"
      className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
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
