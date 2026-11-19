"use client";

// Read-only progress indicator for graded (one-way) mode. It replaces
// QuestionPalette there: graded students must not be able to jump to
// another question, so unlike the palette this renders no buttons and has
// no click handlers anywhere — it is a display element, not a control.
//
// Accessibility: the dot row is marked aria-hidden and the wrapper carries
// role="img" with one composed aria-label, so a screen-reader user gets a
// single clear sentence ("Question 4 of 20. 3 answered, 1 unanswered.")
// instead of being walked through `total` individual dot announcements.
export function ProgressStrip({
  total,
  index,
  answered,
  className = "",
}: {
  total: number;
  index: number;
  answered: number;
  className?: string;
}) {
  const unanswered = Math.max(0, total - answered);
  const position = Math.min(index + 1, total);
  const summary = `Question ${position} of ${total}. ${answered} answered, ${unanswered} unanswered.`;

  return (
    <div className={className}>
      {/* flex-wrap is load-bearing: for large totals (40-question tests)
          the dot row must wrap onto additional lines rather than scroll or
          overflow sideways at 360px. */}
      <div role="img" aria-label={summary} className="flex flex-wrap gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const state = i < index ? "done" : i === index ? "current" : "upcoming";
          return (
            <span
              key={i}
              aria-hidden
              className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none ${
                state === "current"
                  ? "bg-brand-600 ring-2 ring-brand-600/30"
                  : state === "done"
                    ? "bg-accent-500"
                    : "bg-slate-200"
              }`}
            />
          );
        })}
      </div>
      <p className="mt-2 font-mono text-xs tabular-nums text-slate-500">
        Answered {answered} of {total} · {unanswered} unanswered
      </p>
    </div>
  );
}
