"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import type { PaletteItem } from "./types";

// Practice-mode only: graded mode is strictly one-way now (answer, advance,
// locked — no jumping), so this interactive, jumpable palette is rendered
// only by the practice rail. Graded mode uses ProgressStrip, a read-only
// display with no buttons at all.

// Flagged is a corner marker (not just a color swap) so it stays legible
// stacked on top of "answered" — a question can be both, and color alone
// would collapse that combination into one state.
function tileClass(item: PaletteItem, current: boolean): string {
  if (current) {
    return "border-brand-600 bg-brand-600 text-white shadow-sm ring-2 ring-brand-600/30";
  }
  if (item.answered) {
    return "border-brand-300 bg-brand-50 text-brand-700 hover:border-brand-400";
  }
  return "border-line bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50";
}

export function QuestionPalette({
  items,
  current,
  onJump,
  className = "",
}: {
  items: PaletteItem[];
  current: number;
  onJump: (i: number) => void;
  className?: string;
}) {
  const answeredCount = items.filter((i) => i.answered).length;

  // Open by default on sm: and up, collapsible on mobile. matchMedia only
  // exists client-side, so this settles just after mount — a brief
  // desktop-open flash on a small screen is the acceptable trade-off for
  // keeping the initial render (and SSR) deterministic.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(window.matchMedia("(min-width: 640px)").matches);
  }, []);

  return (
    <Card className={className}>
      <details
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
        className="group"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          <span>Questions</span>
          <span className="font-mono text-xs font-medium tabular-nums text-slate-500">
            {answeredCount}/{items.length} answered
          </span>
        </summary>

        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item, i) => {
            const isCurrent = i === current;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onJump(i)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Question ${i + 1}${item.answered ? ", answered" : ", not answered"}${
                  item.flagged ? ", flagged for review" : ""
                }`}
                className={`relative flex size-11 shrink-0 items-center justify-center rounded-lg border font-mono text-sm tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${tileClass(item, isCurrent)}`}
              >
                {i + 1}
                {item.flagged && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-accent-500"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
          <LegendItem swatch="border-brand-600 bg-brand-600" label="Current" />
          <LegendItem swatch="border-brand-300 bg-brand-50" label="Answered" />
          <LegendItem swatch="border-line bg-white" label="Unanswered" />
          <LegendItem dot label="Flagged" />
        </div>
      </details>
    </Card>
  );
}

function LegendItem({
  swatch,
  dot,
  label,
}: {
  swatch?: string;
  dot?: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dot ? (
        <span aria-hidden className="size-2.5 rounded-full bg-accent-500" />
      ) : (
        <span aria-hidden className={`size-2.5 rounded-sm border ${swatch}`} />
      )}
      {label}
    </span>
  );
}
