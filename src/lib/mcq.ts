// Helpers for the Multiple Choice question runner. Pure functions only — grading
// itself stays in store.ts (gradeQuestion), which already scores multiple-answer
// questions all-or-nothing (exact set match), matching PRACTICE_TYPES.md.
import type { Question, Test } from "./types";

/** Letters shown on option cards: A, B, C, D, … */
export const OPTION_LETTERS = "ABCDEFGH".split("");

/** Design tokens from DESIGN_STYLE.md, kept in one place for the runner. */
export const TOKENS = {
  bg: "#FAFAF8",
  text: "#1B2130",
  accent: "#E3A82B",
  border: "#E3E1DB",
  success: "#3F8F5F",
  error: "#C1473A",
  info: "#3E6FA0",
} as const;

/** True when a question accepts more than one correct option. */
export function isMultiAnswer(q: Question): boolean {
  return q.type === "multiple";
}

/** The instruction line shown under the question number. */
export function instructionFor(q: Question): string {
  if (q.type === "multiple") return "Choose all correct answers.";
  if (q.type === "gap") return "Fill in the blank.";
  if (q.type === "short") return "Type your answer.";
  return "Choose one answer.";
}

/** Renderable options for a question (boolean expands to True/False). */
export function optionsFor(q: Question): { id: string; text: string }[] {
  if (q.type === "boolean") {
    return [
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ];
  }
  return q.choices;
}

/** Whether the student has given a usable answer to this question. */
export function isAnswered(answer: string[] | undefined): boolean {
  return !!answer && answer.length > 0 && answer.some((a) => a.trim() !== "");
}

/** How many questions in the test currently have an answer. */
export function answeredCount(
  test: Test,
  answers: Record<string, string[]>,
): number {
  return test.questions.filter((q) => isAnswered(answers[q.id])).length;
}

/** "You selected A." style echo for a single-answer selection (null otherwise). */
export function selectionEcho(q: Question, answer: string[] | undefined): string | null {
  if (!answer || answer.length === 0) return null;
  const opts = optionsFor(q);
  const letters = answer
    .map((id) => opts.findIndex((o) => o.id === id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
    .map((i) => OPTION_LETTERS[i]);
  if (letters.length === 0) return null;
  return `You selected ${letters.join(", ")}.`;
}
