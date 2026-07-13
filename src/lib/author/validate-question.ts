/**
 * validate-question.ts — pure validation helpers for the test-authoring editor.
 *
 * All functions are side-effect-free and depend only on the Question/Test types.
 */

import type { Question } from "@/lib/types";

// ---------------------------------------------------------------------------
// Per-question validation
// ---------------------------------------------------------------------------

/**
 * Returns a list of human-readable issue strings for a question.
 * An empty array means the question is valid.
 */
export function validateQuestion(q: Question): string[] {
  const issues: string[] = [];

  if (!q.prompt.trim()) {
    issues.push("Missing prompt.");
  }

  if (q.points < 1) {
    issues.push("Points must be at least 1.");
  }

  if (q.type === "single" || q.type === "multiple") {
    if (q.choices.length < 2) {
      issues.push("Add at least 2 choices.");
    }
    if (q.choices.some((c) => !c.text.trim())) {
      issues.push("Some choices are empty.");
    }
    // Duplicate choices (case-insensitive, trimmed)
    const texts = q.choices.map((c) => c.text.trim().toLowerCase());
    const seen = new Set<string>();
    let hasDupe = false;
    for (const t of texts) {
      if (t && seen.has(t)) { hasDupe = true; break; }
      seen.add(t);
    }
    if (hasDupe) {
      issues.push("Duplicate choices.");
    }
    if (q.type === "single" && q.correct.length !== 1) {
      issues.push("Mark exactly one correct choice.");
    }
    if (q.type === "multiple" && q.correct.length < 1) {
      issues.push("Mark at least one correct choice.");
    }
  }

  if (q.type === "boolean") {
    if (q.correct[0] !== "true" && q.correct[0] !== "false") {
      issues.push("Set the correct answer.");
    }
  }

  if (q.type === "short" || q.type === "gap") {
    if (q.correct.length < 1) {
      issues.push("Add at least one accepted answer.");
    }
  }

  if (q.type === "gap") {
    if (!/_{2,}/.test(q.prompt)) {
      issues.push("Mark the blank with ___.");
    }
  }

  return issues;
}

/** Returns true when the question has no validation issues. */
export function isQuestionValid(q: Question): boolean {
  return validateQuestion(q).length === 0;
}

// ---------------------------------------------------------------------------
// Test-level readiness
// ---------------------------------------------------------------------------

export interface TestReadiness {
  total: number;
  incomplete: number;
  ready: boolean;
}

/**
 * Summarises the readiness of the whole question list.
 * `ready` is true only when there is at least one question and all are valid.
 */
export function validateTest(questions: Question[]): TestReadiness {
  const total = questions.length;
  const incomplete = questions.filter((q) => !isQuestionValid(q)).length;
  return { total, incomplete, ready: total > 0 && incomplete === 0 };
}
