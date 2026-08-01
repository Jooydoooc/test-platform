"use client";

// The badges this student has actually been awarded, straight from the server.
//
// Why this exists: the dashboard used to re-derive badge state in the browser
// from whatever counts it happened to have on hand. Those counts were partly
// sentinels (see useSkillMastery) and partly hardcoded zeros, so volume and
// unit badges could never unlock on screen no matter what the student did,
// while `badge_unlocks` said otherwise. Two systems, two answers, and the
// student saw the wrong one. `badge_unlocks` is the source of truth — grading
// writes it server-side — so the UI reads it instead of guessing.
//
// BADGE_CATALOG stays in charge of names, descriptions, grouping and the
// locked-state display; this hook only answers "which codes are earned?".
//
// Mirrors the useSkillMastery / useMyAttempts pattern: SUPABASE_ENABLED gate,
// keyed by the authenticated user, one-shot fetch with an `active` teardown
// guard, no `any`.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";

export interface UseEarnedBadgesResult {
  /** Badge codes (matching BADGE_CATALOG[].code) the student has unlocked. */
  codes: Set<string>;
  loading: boolean;
  /** True when the fetch failed — lets the UI avoid claiming "0 badges". */
  error: boolean;
}

type UnlockRow = { badge_id: string };
type BadgeCodeRow = { id: string; code: string };

const EMPTY: Set<string> = new Set();

export function useEarnedBadges(): UseEarnedBadgesResult {
  const [codes, setCodes] = useState<Set<string>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setCodes(EMPTY);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let active = true;

    async function load() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!authUser) {
        setCodes(EMPTY);
        setLoading(false);
        return;
      }

      // Two plain queries rather than an embedded select: the hand-authored
      // Database types declare no relationships, so the embed wouldn't type.
      const { data: unlockRows, error: uErr } = await supabase
        .from("badge_unlocks")
        .select("badge_id")
        .eq("student_id", authUser.id);

      if (!active) return;
      if (uErr) {
        setError(true);
        setLoading(false);
        return;
      }
      const unlocks = (unlockRows ?? []) as UnlockRow[];
      if (unlocks.length === 0) {
        setCodes(EMPTY);
        setLoading(false);
        return;
      }

      const { data: badgeRows, error: bErr } = await supabase
        .from("badges")
        .select("id, code")
        .in("id", unlocks.map((u) => u.badge_id));

      if (!active) return;
      if (bErr) {
        setError(true);
        setLoading(false);
        return;
      }

      setCodes(new Set((badgeRows ?? []).map((b) => (b as BadgeCodeRow).code)));
      setLoading(false);
    }

    load().catch(() => {
      if (!active) return;
      setError(true);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { codes, loading, error };
}
