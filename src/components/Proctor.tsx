"use client";

// Client-side exam proctor (strict lockdown) for the server-graded TestTaker.
//
// What it enforces once engaged:
//   * Fullscreen — engaging requests fullscreen; exiting it blocks the exam
//     behind an overlay until the student re-enters (Esc is easy to hit by
//     accident, so this is a warning + re-enter, not an auto-submit).
//   * Tab / window switch — visibilitychange->hidden auto-submits (the strict
//     rule the admin chose). window blur is recorded as a softer signal.
//   * Copy / cut / paste — blocked everywhere (paste too, so prepared answers
//     can't be dropped into answer fields).
//   * Right-click (context menu) — blocked.
//   * Text selection — blocked outside real inputs/textareas (typing still works).
//   * DevTools shortcuts — key combos swallowed and counted.
//
// TRUST NOTE: this is browser-side deterrence, not proof. The tally it produces
// is reported at submit and stored as an integrity *hint* for a teacher to
// review — it never changes grading or XP. A determined student can bypass it.
//
// The event-type keys below are shared verbatim with the vanilla proctor injected
// into hosted /ht tests, so teacher-facing integrity data reads uniformly across
// both test surfaces.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type IntegrityFlags = Record<string, number>;

export interface Integrity {
  /** Total violations across all types. */
  violations: number;
  /** Per-type counts, e.g. { tab_switch: 1, copy: 3 }. */
  flags: IntegrityFlags;
}

// Canonical event-type keys (keep in sync with the /ht vanilla proctor).
type ViolationType =
  | "fullscreen_exit"
  | "tab_switch"
  | "window_blur"
  | "copy"
  | "cut"
  | "paste"
  | "right_click"
  | "devtools_key";

function isEditable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    node.isContentEditable === true
  );
}

function requestFs(): Promise<void> {
  const el = document.documentElement;
  const fn =
    el.requestFullscreen ||
    // Safari
    (el as unknown as { webkitRequestFullscreen?: () => Promise<void> })
      .webkitRequestFullscreen;
  try {
    const r = fn?.call(el);
    return r instanceof Promise ? r : Promise.resolve();
  } catch {
    return Promise.reject(new Error("fullscreen denied"));
  }
}

function inFullscreen(): boolean {
  return Boolean(
    document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: unknown })
        .webkitFullscreenElement,
  );
}

export interface UseProctorOptions {
  /** Called once when a strict violation (tab switch) forces submission. */
  onAutoSubmit: () => void;
  /** Master switch — when false the hook is inert (used to stop after submit). */
  enabled: boolean;
}

export interface ProctorApi {
  /** Engage lockdown from a user gesture (enters fullscreen). */
  engage: () => Promise<void>;
  /** Release all listeners and exit fullscreen (call after submit). */
  disengage: () => void;
  /** True once engage() has run. */
  engaged: boolean;
  /** Live violation tally for the header badge. */
  violations: number;
  /** True while the student has dropped out of fullscreen (overlay shown). */
  needsFullscreen: boolean;
  /** Re-enter fullscreen from the overlay button. */
  reenterFullscreen: () => void;
  /** True after the first tab/window switch, until acknowledged. */
  tabWarning: boolean;
  /** Acknowledge the one-time tab-switch warning. */
  dismissTabWarning: () => void;
  /** Snapshot for the submit payload. */
  getIntegrity: () => Integrity;
}

/** Whether this browser can enter element fullscreen (false on iPhone Safari). */
export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as unknown as {
    requestFullscreen?: unknown;
    webkitRequestFullscreen?: unknown;
  };
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function useProctor({ onAutoSubmit, enabled }: UseProctorOptions): ProctorApi {
  const [engaged, setEngaged] = useState(false);
  const [violations, setViolations] = useState(0);
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  // Warn-then-submit: the first tab/window switch shows a warning on return;
  // a second one submits. One accidental tap should never end a learner's test.
  const [tabWarning, setTabWarning] = useState(false);
  const tabStrikesRef = useRef(0);

  // Mutable tally read at submit time (avoids stale closure over state).
  const flagsRef = useRef<IntegrityFlags>({});
  const violationsRef = useRef(0);
  const engagedRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  onAutoSubmitRef.current = onAutoSubmit;

  const record = useCallback((type: ViolationType) => {
    flagsRef.current[type] = (flagsRef.current[type] ?? 0) + 1;
    violationsRef.current += 1;
    setViolations(violationsRef.current);
  }, []);

  const getIntegrity = useCallback(
    (): Integrity => ({
      violations: violationsRef.current,
      flags: { ...flagsRef.current },
    }),
    [],
  );

  const reenterFullscreen = useCallback(() => {
    requestFs()
      .then(() => setNeedsFullscreen(false))
      .catch(() => {
        /* keep overlay up; user can retry */
      });
  }, []);

  const engage = useCallback(async () => {
    engagedRef.current = true;
    setEngaged(true);
    try {
      await requestFs();
    } catch {
      // Fullscreen can be denied (permissions, unsupported). Degrade: the
      // remaining listeners (tab-switch, copy, etc.) still apply.
    }
  }, []);

  const disengage = useCallback(() => {
    engagedRef.current = false;
    setEngaged(false);
    if (inFullscreen()) {
      const exit =
        document.exitFullscreen ||
        (document as unknown as { webkitExitFullscreen?: () => Promise<void> })
          .webkitExitFullscreen;
      try {
        void exit?.call(document);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (!engagedRef.current) return;
      if (document.hidden) {
        // Left the exam. Always recorded. First strike is a warning; a second
        // strike submits. This makes an accidental notification/app-switch
        // recoverable instead of instantly ending the attempt.
        record("tab_switch");
        tabStrikesRef.current += 1;
        if (tabStrikesRef.current >= 2 && !autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          onAutoSubmitRef.current();
        }
      } else if (tabStrikesRef.current === 1 && !autoSubmittedRef.current) {
        // Returned after the first strike — surface the one-time warning.
        setTabWarning(true);
      }
    };
    const onBlur = () => {
      if (!engagedRef.current) return;
      record("window_blur");
    };
    const onFsChange = () => {
      if (!engagedRef.current) return;
      if (!inFullscreen()) {
        record("fullscreen_exit");
        setNeedsFullscreen(true);
      } else {
        setNeedsFullscreen(false);
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!engagedRef.current) return;
      e.preventDefault();
      record("right_click");
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!engagedRef.current) return;
      e.preventDefault();
      record("copy");
    };
    const onCut = (e: ClipboardEvent) => {
      if (!engagedRef.current) return;
      e.preventDefault();
      record("cut");
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!engagedRef.current) return;
      e.preventDefault();
      record("paste");
    };
    const onSelectStart = (e: Event) => {
      if (!engagedRef.current) return;
      // Allow selection/caret inside real answer fields; block page text.
      if (isEditable(e.target)) return;
      e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!engagedRef.current) return;
      const k = e.key.toLowerCase();
      const meta = e.ctrlKey || e.metaKey;
      // DevTools + view-source shortcuts.
      if (
        e.key === "F12" ||
        (meta && e.shiftKey && (k === "i" || k === "j" || k === "c")) ||
        (meta && k === "u")
      ) {
        e.preventDefault();
        record("devtools_key");
        return;
      }
      // Clipboard / print / save shortcuts (block even in fields to stop pasted
      // answers; typing itself is unaffected).
      if (meta && (k === "c" || k === "x" || k === "v" || k === "p" || k === "s")) {
        e.preventDefault();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, record]);

  const dismissTabWarning = useCallback(() => setTabWarning(false), []);

  return {
    engage,
    disengage,
    engaged,
    violations,
    needsFullscreen,
    reenterFullscreen,
    tabWarning,
    dismissTabWarning,
    getIntegrity,
  };
}

// Shared keyboard focus trap for blocking overlays: FullscreenGuard and
// ProctorWarning below, and TestTaker's ConfirmSubmit. All three are
// role="dialog"/"alertdialog" screens meant to be modal, but neither
// `role="dialog"` nor `autoFocus` on the default button actually stops Tab
// from walking off the overlay into whatever is behind it — for the proctor
// guards specifically, that "whatever" is the live exam, so an un-trapped Tab
// lets a keyboard user change answers while the guard claims to be blocking
// them. This cycles Tab/Shift+Tab within the container and hands focus back
// to whatever had it before the overlay mounted, once it unmounts.
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null); // skip hidden elements
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture phase: run before the guarded controls (or any other page
    // listener) can react to Tab, so the trap can't be bypassed by a handler
    // that stops propagation further down the tree.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [containerRef]);
}

// Blocking overlay shown when the student leaves fullscreen mid-exam.
export function FullscreenGuard({
  onReenter,
}: {
  onReenter: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef);
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="proctor-guard-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-6 w-6"
            aria-hidden
          >
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h2 id="proctor-guard-title" className="mt-4 text-lg font-bold text-slate-900">
          Return to secure mode
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          You left fullscreen. This test is proctored — leaving fullscreen is
          recorded. Re-enter to continue.
        </p>
        <button
          type="button"
          autoFocus
          onClick={onReenter}
          className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Re-enter fullscreen
        </button>
        <a
          href="/tests"
          className="mt-3 inline-block text-xs font-medium text-slate-400 transition hover:text-slate-600"
        >
          Leave test
        </a>
      </div>
    </div>
  );
}

// One-time warning shown when the student returns after their first tab/window
// switch. The next switch will submit — this makes the rule fair, not a trap.
export function ProctorWarning({ onDismiss }: { onDismiss: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef);
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="proctor-warn-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-6 w-6"
            aria-hidden
          >
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h2 id="proctor-warn-title" className="mt-4 text-lg font-bold text-slate-900">
          You left the exam
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This was recorded. If you switch tabs or apps again, your test will be
          submitted automatically.
        </p>
        <button
          type="button"
          autoFocus
          onClick={onDismiss}
          className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Continue test
        </button>
      </div>
    </div>
  );
}
