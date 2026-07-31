import type { SkillArea } from "@/lib/database.types";

// Upper bound on a single skill total, mirrored from the submit route so a
// malformed key cannot produce an out-of-range denominator.
const MAX_TOTAL_CEILING = 200;

// ---------------------------------------------------------------------------
// Server-side re-grading (migration 0027).
//
// A hosted test whose id has a row in html_test_answer_keys is graded HERE, from
// the raw answers, and the client's claimed correct/total is discarded. Answers
// are matched as text because hosted tests shuffle their options per attempt.
// ---------------------------------------------------------------------------

export type AnswerKeyItem = { t: "mc" | "wo" | "tr"; a: string[] };
export type AnswerKey = {
  version: number;
  /** Questions served per attempt — the denominator the server enforces. */
  count?: number;
  skill: SkillArea;
  items: Record<string, AnswerKeyItem>;
};

// Normalisation shared by every answer type. Mirrors canon() in the hosted test
// files so a submission grades the same way on both sides: lower-cased, curly
// apostrophes folded, whitespace collapsed, trailing sentence punctuation
// dropped, and the common contractions expanded to their full forms.
const CONTRACTIONS: Record<string, string> = {
  "isn't": "is not",
  "aren't": "are not",
  "i'm": "i am",
  "she's": "she is",
  "he's": "he is",
  "it's": "it is",
  "we're": "we are",
  "they're": "they are",
  "what's": "what is",
  "where's": "where is",
  "who's": "who is",
  "that's": "that is",
  "doesn't": "does not",
  "don't": "do not",
};

export function canon(input: string): string {
  let s = input
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "");
  for (const [from, to] of Object.entries(CONTRACTIONS)) {
    s = s.split(from).join(to);
  }
  // "Dilnoza's dancing" is correct English; "my sister's cake" is a possessive.
  // Only expand when an -ing verb follows.
  s = s.replace(/'s (?=\S+ing\b)/g, " is ");
  s = s.replace(/'re (?=\S+ing\b)/g, " are ");
  s = s.replace(/'m (?=\S+ing\b)/g, " am ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Grade the submitted answers against the stored key.
 *
 * The denominator is `key.count` when the key declares one — never the length
 * of the payload. Otherwise a tampered client could send a single correct
 * answer and record 1/1 = 100 %. Duplicate ids are rejected by the caller for
 * the same reason: thirty copies of one correct answer is not thirty correct
 * answers. An id absent from the key simply scores nothing.
 */
export function regrade(
  key: AnswerKey,
  answers: { id: string; value: string | null }[],
): { correct: number; total: number } {
  let correct = 0;
  for (const { id, value } of answers) {
    const item = key.items[id];
    if (!item || value === null) continue;
    const given = canon(value);
    if (given.length > 0 && item.a.some((accepted) => canon(accepted) === given)) {
      correct++;
    }
  }
  const declared =
    typeof key.count === "number" && Number.isInteger(key.count) && key.count > 0
      ? key.count
      : answers.length;
  const total = Math.min(declared, MAX_TOTAL_CEILING);
  return { correct: Math.min(correct, total), total };
}
