import type { QuestionFormat } from "@/lib/database.types";

// Server-side grading (moved off the client). Auto-gradable formats resolve
// immediately; Writing/Speaking are AI-assisted and returned as "pending".
// Thresholds that would be tuned live (e.g. translation fuzzy-match cutoff)
// belong in config — see CLAUDE_RULES.md; the constant here is a placeholder.

export const AUTO_GRADED: QuestionFormat[] = [
  "MULTIPLE_CHOICE_SINGLE",
  "MULTIPLE_CHOICE_MULTI",
  "TRUE_FALSE",
  "GAP_FILL",
  "SHORT_ANSWER",
  "MATCHING",
  "REORDERING",
  "TRANSLATION_UZ_EN",
  "VOCAB_EXAMPLE_SENTENCE",
];

export const AI_GRADED: QuestionFormat[] = [
  "WRITING_SENTENCE",
  "WRITING_EXTENDED",
  "SPEAKING_AUDIO",
];

export function isAutoGraded(format: QuestionFormat): boolean {
  return AUTO_GRADED.includes(format);
}

export interface GradeInput {
  format: QuestionFormat;
  points: number;
  answerKey: unknown; // { correct?: string[] } | { accepted?: string[] }
  response: unknown; // { selected?: string[] } | { text?: string }
}

export interface GradeOutcome {
  isCorrect: boolean | null; // null while pending AI review
  awardedPoints: number;
  needsTeacherCheck: boolean;
  pending: boolean;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function keyCorrect(answerKey: unknown): string[] {
  if (answerKey && typeof answerKey === "object" && "correct" in answerKey) {
    return asStringArray((answerKey as { correct?: unknown }).correct);
  }
  return [];
}

function keyAccepted(answerKey: unknown): string[] {
  if (answerKey && typeof answerKey === "object" && "accepted" in answerKey) {
    return asStringArray((answerKey as { accepted?: unknown }).accepted);
  }
  return [];
}

function respSelected(response: unknown): string[] {
  if (response && typeof response === "object" && "selected" in response) {
    return asStringArray((response as { selected?: unknown }).selected);
  }
  return [];
}

function respText(response: unknown): string {
  if (response && typeof response === "object" && "text" in response) {
    const t = (response as { text?: unknown }).text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

// Cheap token-overlap ratio for fuzzy translation matching. Real tuning + a
// low-confidence review queue is a documented gap; this is a safe first pass.
function overlap(a: string, b: string): number {
  const at = new Set(norm(a).split(" ").filter(Boolean));
  const bt = new Set(norm(b).split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let hit = 0;
  for (const t of at) if (bt.has(t)) hit++;
  return hit / Math.max(at.size, bt.size);
}

const FUZZY_ACCEPT = 0.8; // >= accept; between LOW and this -> teacher check
const FUZZY_LOW = 0.4;

export function gradeQuestion(input: GradeInput): GradeOutcome {
  const { format, points } = input;

  if (AI_GRADED.includes(format)) {
    return { isCorrect: null, awardedPoints: 0, needsTeacherCheck: false, pending: true };
  }

  const full = (): GradeOutcome => ({
    isCorrect: true,
    awardedPoints: points,
    needsTeacherCheck: false,
    pending: false,
  });
  const zero = (needsTeacherCheck = false): GradeOutcome => ({
    isCorrect: false,
    awardedPoints: 0,
    needsTeacherCheck,
    pending: false,
  });

  switch (format) {
    case "MULTIPLE_CHOICE_SINGLE":
    case "TRUE_FALSE": {
      const sel = respSelected(input.response);
      const correct = keyCorrect(input.answerKey);
      return sel.length === 1 && correct.includes(sel[0]) ? full() : zero();
    }
    case "MULTIPLE_CHOICE_MULTI":
    case "MATCHING":
    case "REORDERING": {
      const sel = [...respSelected(input.response)].sort().join(",");
      const correct = [...keyCorrect(input.answerKey)].sort().join(",");
      return sel !== "" && sel === correct ? full() : zero();
    }
    case "GAP_FILL":
    case "SHORT_ANSWER":
    case "VOCAB_EXAMPLE_SENTENCE": {
      const given = norm(respText(input.response));
      const accepted = keyAccepted(input.answerKey).map(norm);
      return given !== "" && accepted.includes(given) ? full() : zero();
    }
    case "TRANSLATION_UZ_EN": {
      // Multiple valid translations: fuzzy match, queue low-confidence.
      const given = respText(input.response);
      const accepted = keyAccepted(input.answerKey);
      const best = accepted.reduce((m, a) => Math.max(m, overlap(given, a)), 0);
      if (best >= FUZZY_ACCEPT) return full();
      if (best >= FUZZY_LOW) return zero(true); // needs teacher check, not auto-wrong
      return zero();
    }
    default:
      return zero();
  }
}
