import Link from "next/link";
import { ArrowLeft, BookOpen, BookText, Type } from "lucide-react";
import type { TestGroup } from "@/lib/types";

// Premium hero for a single-category test page. Server-safe (no hooks).
const META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; blurb: string }
> = {
  "Grammar Tests": {
    icon: Type,
    blurb: "Master English grammar — rules, structures and usage.",
  },
  "Vocabulary Tests": {
    icon: BookOpen,
    blurb: "Build and test your word knowledge.",
  },
  "Reading Tests": {
    icon: BookText,
    blurb: "Sharpen comprehension and reading skills.",
  },
};

export function CategoryHeader({ group }: { group: TestGroup }) {
  const meta = META[group] ?? { icon: Type, blurb: "" };
  const Icon = meta.icon;
  return (
    <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-7 text-white shadow-card-hover sm:p-9">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
      <div className="relative">
        <Link
          href="/tests"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Test Center
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/20">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {group.replace(" Tests", "")}
            </h1>
            <p className="mt-0.5 text-sm text-brand-100/90">{meta.blurb}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
