"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { useFocusTrap } from "@/components/Proctor";

// The ONLY pre-submit gate in graded mode. There is no review summary screen:
// "Finish test" opens this modal directly over the question the student is
// still sitting on, so "Continue test" simply closes it and leaves that
// question editable. That is why there is no "Back to test" here — there is
// nowhere to go back to, the test never left the screen.
//
// useFocusTrap is a security fix carried over from the DB rail's version —
// without it a keyboard user can Tab out of the overlay into the answers
// behind it while a submit decision is pending.
//
// Flagging no longer exists in graded mode (that's practice-only now), so
// there is no `flagged` prop here — only `unanswered`, a plain count of
// blank questions, which is what actually costs the student points.
//
// `submitting` is what makes this modal safe against double-submission at the
// UI layer: once the student confirms, every way out of this dialog is shut
// off — the confirm button is disabled, "Continue test" is disabled, Escape
// stops dismissing, and a backdrop click stops dismissing. Without that, a
// second click, an Escape, or a stray backdrop tap could fire onConfirm again
// or drop the student back onto a live question while their answers were
// already in flight. The server-side CAS in the finalize RPCs is the real
// idempotency guarantee; this is the layer that stops the request being made
// twice in the first place.
export function ConfirmSubmit({
  answered,
  total,
  unanswered,
  onCancel,
  onConfirm,
  confirmLabel = "Submit test",
  submitting = false,
  note,
}: {
  answered: number;
  total: number;
  unanswered: number;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  /** True once submission has begun — freezes every control and exit path. */
  submitting?: boolean;
  note?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(containerRef);

  // submittingRef mirrors the prop so the Escape handler below reads the
  // CURRENT value. Binding the effect to `submitting` instead would re-run it
  // on every change, and a listener registered in the same tick as the state
  // flip could still observe the stale value.
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submittingRef.current) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="exam-confirm-title"
      onClick={submitting ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="exam-confirm-title"
          className="font-display text-lg font-bold text-slate-900"
        >
          Submit test?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          You answered{" "}
          <span className="font-mono tabular-nums">{answered}</span> of{" "}
          <span className="font-mono tabular-nums">{total}</span>.
          {note ? " " : null}
          {note}
        </p>
        {unanswered > 0 && (
          <p className="mt-1 text-sm text-amber-700">
            {unanswered} unanswered question{unanswered > 1 ? "s" : ""} will
            score zero.
          </p>
        )}
        <p className="mt-3 text-sm font-semibold text-red-600">
          This is final. Once submitted, you can't return to this test.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          {/* "Continue test", not "Back to test": this modal sits on top of
              the live question, so dismissing it returns the student to the
              exact question they were already answering, still editable. */}
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Continue test
          </Button>
          <Button ref={confirmRef} onClick={onConfirm} disabled={submitting}>
            {submitting ? "Submitting…" : confirmLabel}
          </Button>
        </div>
        {submitting && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            Submitting your answers — don't close this page.
          </p>
        )}
      </div>
    </div>
  );
}
