import type { SkillArea } from "@/lib/database.types";

// Upper bound on a single skill total, mirrored from the submit route so a
// malformed key cannot produce an out-of-range denominator.
const MAX_TOTAL_CEILING = 200;

// ---------------------------------------------------------------------------
// Server-side re-grading for hosted HTML tests (migration 0027).
//
// A hosted test whose id has a row in html_test_answer_keys is graded HERE, from
// the raw answers, and the client's claimed correct/total is discarded.
//
// The normalisation below is a faithful port of the grading code inside the
// hosted test files themselves — expand() / normStd() / normLenient() /
// accepts(). It has to agree with them exactly: if the server is stricter than
// the page, a student sees "correct" on screen and is marked wrong in their
// record, which is worse than not re-grading at all.
//
// Answers are matched as TEXT, never as choice indexes, so a test that shuffles
// its options per attempt still grades correctly.
// ---------------------------------------------------------------------------

/**
 * Item types. `mcq`/`order`/`trans` is the spelling used by the bilingual
 * fixed-set tests; `mc`/`wo`/`tr` by the random-bank ones. Both are accepted so
 * a single grader serves every hosted test.
 */
export type AnswerKeyItemType = "mcq" | "order" | "trans" | "mc" | "wo" | "tr";

export type AnswerKeyItem = {
  t: AnswerKeyItemType;
  /** Accepted answers, as displayed text. */
  a: string[];
};

export type AnswerKey = {
  version: number;
  /** Questions served per attempt — the denominator the server enforces. */
  count?: number;
  skill: SkillArea;
  /** Keyed by question id, or by 0-based index for fixed-set tests. */
  items: Record<string, AnswerKeyItem>;
};

/** Contractions the tests expand before comparing. */
function expand(s: string): string {
  return s
    .replace(/\bisn't\b/g, "is not")
    .replace(/\baren't\b/g, "are not")
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bhe's\b/g, "he is")
    .replace(/\bshe's\b/g, "she is")
    .replace(/\bit's\b/g, "it is")
    .replace(/\bthey're\b/g, "they are")
    .replace(/\bwe're\b/g, "we are")
    .replace(/\byou're\b/g, "you are")
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bwhere's\b/g, "where is")
    .replace(/\bwhy's\b/g, "why is")
    .replace(/\bwho's\b/g, "who is")
    .replace(/\bthat's\b/g, "that is")
    .replace(/\bdoesn't\b/g, "does not")
    .replace(/\bdon't\b/g, "do not");
}

/** Strict comparison form — multiple choice and word order. */
export function normStd(input: string): string {
  let x = String(input || "")
    .toLowerCase()
    .replace(/[‘’`]/g, "'");
  x = expand(x);
  // A name contraction before an -ing verb is correct English ("Sara's
  // studying"); a possessive is not ("my sister's cake"), so only expand when
  // the following word is the -ing verb.
  x = x
    .replace(/'s (?=\S+ing\b)/g, " is ")
    .replace(/'re (?=\S+ing\b)/g, " are ")
    .replace(/'m (?=\S+ing\b)/g, " am ");
  x = x
    .replace(/[.,!?;:"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return x;
}

/**
 * Lenient form — translation answers, where filler time words and articles
 * should not decide right from wrong.
 */
export function normLenient(input: string): string {
  let x = normStd(input)
    .replace(/\bat the moment\b/g, " ")
    .replace(/\bright now\b/g, " ")
    .replace(/\bnow\b/g, " ");
  x = x
    .split(" ")
    .filter((w) => w && w !== "a" && w !== "an" && w !== "the")
    .join(" ");
  return x.replace(/\s+/g, " ").trim();
}

/** Translation answers grade leniently; everything else grades strictly. */
function isLenient(t: AnswerKeyItemType): boolean {
  return t === "trans" || t === "tr";
}

function matches(item: AnswerKeyItem, given: string): boolean {
  const norm = isLenient(item.t) ? normLenient : normStd;
  const v = norm(given);
  if (v.length === 0) return false;
  return item.a.some((accepted) => norm(accepted) === v);
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
    if (matches(item, value)) correct++;
  }
  const declared =
    typeof key.count === "number" && Number.isInteger(key.count) && key.count > 0
      ? key.count
      : answers.length;
  const total = Math.min(declared, MAX_TOTAL_CEILING);
  return { correct: Math.min(correct, total), total };
}
