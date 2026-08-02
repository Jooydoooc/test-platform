"use client";

import { useCallback, useEffect, useState } from "react";

// Cross-tree "is a live, distraction-free exam currently on screen" flag.
//
// The repo has no React context anywhere — this follows the same module-level
// state + window custom event pattern as useStoreValue in ./store.ts, just
// without localStorage (this is ephemeral, in-memory, per-tab UI state, not
// data worth persisting or syncing across tabs).
//
// Only the exam surfaces themselves (TestTaker, the legacy /tests/[id] runner)
// set this; SiteHeader and BackButton only ever read it, so "when to hide
// chrome" lives with the phase state that actually knows the answer instead
// of being re-derived from the URL in two separate places.
const LIVE_TEST_EVENT = "tp.liveTest.change";

let liveTest = false;

function getLiveTest(): boolean {
  return liveTest;
}

export function setLiveTest(value: boolean): void {
  if (typeof window === "undefined") return;
  if (liveTest === value) return;
  liveTest = value;
  window.dispatchEvent(new Event(LIVE_TEST_EVENT));
}

export function useLiveTest(): boolean {
  // Server render (and the first client render, before hydration) always
  // sees false — chrome is visible by default and only hides once an exam
  // surface explicitly asks for it via setLiveTest(true) in an effect. That
  // keeps the server and first-client-paint markup identical, so there's no
  // hydration mismatch; the hide happens as a normal post-mount update.
  const [value, setValue] = useState(false);
  const refresh = useCallback(() => setValue(getLiveTest()), []);
  useEffect(() => {
    refresh();
    window.addEventListener(LIVE_TEST_EVENT, refresh);
    return () => window.removeEventListener(LIVE_TEST_EVENT, refresh);
  }, [refresh]);
  return value;
}
