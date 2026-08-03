import Link from "next/link";
import { ArrowLeft, BookOpen, BookText, Headphones, Type } from "lucide-react";
import type { TestGroup } from "@/lib/types";

// Focused header for a single-category test page. Server-safe (no hooks).
const META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; blurb: string }
> = {
  "Grammar Tests": {
    icon: Type,
    blurb: "Grammar rules, structures and usage.",
  },
  "Vocabulary Tests": {
    icon: BookOpen,
    blurb: "Build and test your word knowledge.",
  },
  "Reading Tests": {
    icon: BookText,
    blurb: "Comprehension and reading skills.",
  },
  "Listening Tests": {
    icon: Headphones,
    blurb: "Train your ear with audio-based tests.",
  },
};

export function CategoryHeader({ group }: { group: TestGroup }) {
  const meta = META[group] ?? { icon: Type, blurb: "" };
  const Icon = meta.icon;
  return (
    <header className="rounded-2xl border border-slate-200 bg-brand-600 p-6 text-white shadow-card sm:p-7">
      <div>
        <Link
          href="/tests"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Test Center
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {group.replace(" Tests", "")}
            </h1>
            <p className="mt-0.5 text-sm text-slate-200">{meta.blurb}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
