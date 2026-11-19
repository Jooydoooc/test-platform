"use client";

import { Flag } from "lucide-react";

// Practice-mode only. Graded mode dropped flag-for-review entirely (it's
// strictly one-way now: answer, advance, locked), so this button is no
// longer rendered on the graded rail. Kept as-is — file and export intact —
// because the practice rail still uses it.
export function FlagButton({
  flagged,
  onToggle,
}: {
  flagged: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={flagged}
      onClick={onToggle}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:min-h-0 sm:py-1.5 ${
        flagged
          ? "border-accent-500 bg-accent-50 text-accent-700"
          : "border-line bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <Flag
        className={`h-4 w-4 ${flagged ? "fill-accent-500 text-accent-500" : ""}`}
        aria-hidden
      />
      {flagged ? "Flagged" : "Flag for review"}
    </button>
  );
}
