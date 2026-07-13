/**
 * parse-questions.ts — bulk-paste parser for the test-authoring editor.
 *
 * FORMAT (one block per question, blocks separated by one or more blank lines):
 *
 *   [SINGLE] 1. What is the capital of France?
 *   A) Berlin
 *   B) Paris *
 *   C) Madrid
 *   D) Rome
 *   Explanation: Paris has been France's capital since 987.
 *
 *   [MULTIPLE] Which are prime numbers?
 *   - 2 *
 *   - 4
 *   - 7 *
 *   - 9
 *
 *   [TF] The Earth orbits the Sun.
 *   Answer: True
 *
 *   [SHORT] What gas do plants absorb during photosynthesis?
 *   Answer: carbon dioxide | CO2
 *
 *   [GAP] She ___ to school every morning.
 *   Answer: goes
 *   (2 pts)
 *
 * TYPE TAGS (case-insensitive, first line): [SINGLE]/[SINGLECHOICE],
 *   [MULTIPLE]/[MULTI], [TF]/[TRUEFALSE]/[BOOLEAN]/[BOOL], [SHORT], [GAP]/[FILL].
 * Leading question numbers stripped: "12." / "12)" / "Q12."
 * Choice lines: A) / A. / a) / (A) / - / * / •  prefix.
 *   Correct marker: trailing " *", trailing "(correct)", leading "*", [x], [✓].
 * Answer line: "Answer:" / "Ans:" / "A:" / "Correct:" (case-insensitive).
 *   Boolean → True/False. Short/gap → split on | / , ; trim; drop empties.
 * Explanation: "Explanation:" / "Why:"
 * Points: "(N pts)" / "[N points]" / "points: N" anywhere in the block.
 *
 * Type inference (when no [TYPE] tag):
 *   choice lines present → multiple if ≥2 marked correct, else single
 *   prompt has ___ → gap
 *   answer line is exactly true/false → boolean
 *   else → short
 */

import { uid } from "@/lib/store";
import type { Question, QuestionType } from "@/lib/types";

export interface ParsedQuestion {
  question: Question;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip CRLF → LF, split into lines. */
function toLines(raw: string): string[] {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** Split the raw text into blocks (separated by one or more blank lines). */
function splitBlocks(raw: string): string[][] {
  const lines = toLines(raw);
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

// ---------------------------------------------------------------------------
// Type-tag parsing
// ---------------------------------------------------------------------------

const TYPE_TAG_RE =
  /^\[(?:single(?:choice)?|multiple?|multi|tf|truefalse|bool(?:ean)?|short|gap|fill)\]/i;

function parseTypeTag(s: string): QuestionType | null {
  const m = s.match(TYPE_TAG_RE);
  if (!m) return null;
  const tag = m[0].slice(1, -1).toLowerCase();
  if (tag === "single" || tag === "singlechoice") return "single";
  if (tag === "multiple" || tag === "multi") return "multiple";
  if (tag === "tf" || tag === "truefalse" || tag === "boolean" || tag === "bool")
    return "boolean";
  if (tag === "short") return "short";
  if (tag === "gap" || tag === "fill") return "gap";
  return null;
}

// ---------------------------------------------------------------------------
// Leading-number strip ("12." / "12)" / "Q12.")
// ---------------------------------------------------------------------------

const LEADING_NUM_RE = /^(?:Q\d+\.|Q\d+\)|\d+[.)]\s*)/i;

function stripLeadingNumber(s: string): string {
  return s.replace(LEADING_NUM_RE, "").trim();
}

// ---------------------------------------------------------------------------
// Choice detection
// ---------------------------------------------------------------------------

// A) / A. / a) / (A) / - / * / • (preceded only by optional whitespace)
const CHOICE_PREFIX_RE =
  /^(?:[a-zA-Z]\)|[a-zA-Z]\.\s|\([a-zA-Z]\)\s*|[-*•]\s)/;

interface ParsedChoice {
  text: string;
  correct: boolean;
}

function parseChoiceLine(line: string): ParsedChoice | null {
  const trimmed = line.trim();
  if (!CHOICE_PREFIX_RE.test(trimmed)) return null;

  // Strip the label prefix
  let text = trimmed.replace(CHOICE_PREFIX_RE, "").trim();

  let correct = false;

  // Leading * marker (before the actual text): "* Paris"
  if (text.startsWith("* ")) {
    correct = true;
    text = text.slice(2).trim();
  }
  // [x] / [✓] marker
  if (/^\[(?:x|✓)\]\s*/i.test(text)) {
    correct = true;
    text = text.replace(/^\[(?:x|✓)\]\s*/i, "").trim();
  }
  // Trailing (correct)
  if (/\(correct\)\s*$/i.test(text)) {
    correct = true;
    text = text.replace(/\(correct\)\s*$/i, "").trim();
  }
  // Trailing *
  if (/ \*$/.test(text)) {
    correct = true;
    text = text.slice(0, -2).trim();
  }

  return { text, correct };
}

// ---------------------------------------------------------------------------
// Answer-line parsing
// ---------------------------------------------------------------------------

const ANSWER_LINE_RE = /^(?:answer|ans|a|correct)\s*:/i;

function parseAnswerLine(line: string): string | null {
  if (!ANSWER_LINE_RE.test(line.trim())) return null;
  return line.replace(ANSWER_LINE_RE, "").trim();
}

// ---------------------------------------------------------------------------
// Explanation-line parsing
// ---------------------------------------------------------------------------

const EXPLANATION_LINE_RE = /^(?:explanation|why)\s*:/i;

function parseExplanationLine(line: string): string | null {
  if (!EXPLANATION_LINE_RE.test(line.trim())) return null;
  return line.replace(EXPLANATION_LINE_RE, "").trim();
}

// ---------------------------------------------------------------------------
// Points parsing
// ---------------------------------------------------------------------------

// "(N pts)" / "[N points]" / "points: N" (anywhere in text)
const POINTS_RE = /\(\s*(\d+)\s*pts?\s*\)|\[\s*(\d+)\s*points?\s*\]|points\s*:\s*(\d+)/i;

function extractPoints(lines: string[]): { points: number; lines: string[] } {
  let points = 1;
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(POINTS_RE);
    if (m) {
      const val = Number(m[1] ?? m[2] ?? m[3]);
      if (!isNaN(val) && val >= 1) points = val;
      // Remove the points annotation from the line (keep the rest if any)
      const rest = line.replace(POINTS_RE, "").trim();
      if (rest) out.push(rest);
      // If the line was purely the points annotation, drop it entirely
    } else {
      out.push(line);
    }
  }
  return { points, lines: out };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseQuestions(raw: string): ParsedQuestion[] {
  if (!raw.trim()) return [];

  const blocks = splitBlocks(raw);
  const results: ParsedQuestion[] = [];

  for (const block of blocks) {
    // Skip whitespace-only blocks (already filtered by splitBlocks, but be safe)
    if (block.every((l) => l.trim() === "")) continue;

    const warnings: string[] = [];

    // ---- Pre-pass: extract points from block ----
    const { points, lines } = extractPoints(block);

    // ---- Line 0: prompt ----
    let firstLine = (lines[0] ?? "").trim();

    // Strip optional [TYPE] tag
    let explicitType: QuestionType | null = null;
    const typeTag = firstLine.match(TYPE_TAG_RE);
    if (typeTag) {
      explicitType = parseTypeTag(typeTag[0]);
      firstLine = firstLine.slice(typeTag[0].length).trim();
    }

    // Strip optional leading question number
    firstLine = stripLeadingNumber(firstLine);

    const prompt = firstLine;

    // ---- Rest of lines: classify ----
    const choiceLines: ParsedChoice[] = [];
    let answerValue: string | null = null;
    let explanation: string | undefined = undefined;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      const expl = parseExplanationLine(trimmed);
      if (expl !== null) {
        explanation = expl;
        continue;
      }

      const ans = parseAnswerLine(trimmed);
      if (ans !== null) {
        answerValue = ans;
        continue;
      }

      const choice = parseChoiceLine(trimmed);
      if (choice !== null) {
        choiceLines.push(choice);
        continue;
      }

      // Unrecognised line — could be a continuation of explanation; ignore.
    }

    // ---- Type inference ----
    let type: QuestionType;
    if (explicitType) {
      type = explicitType;
    } else if (choiceLines.length > 0) {
      const markedCount = choiceLines.filter((c) => c.correct).length;
      type = markedCount >= 2 ? "multiple" : "single";
    } else if (/_{2,}/.test(prompt)) {
      type = "gap";
    } else if (answerValue && /^(true|false)$/i.test(answerValue.trim())) {
      type = "boolean";
    } else {
      type = "short";
    }

    // ---- Build Question ----
    const id = uid();
    let correct: string[] = [];

    if (type === "single" || type === "multiple") {
      const choices = choiceLines.map((c) => ({ id: uid(), text: c.text }));
      const correctIds = choices
        .filter((_, idx) => choiceLines[idx].correct)
        .map((c) => c.id);

      if (choices.length < 2) {
        warnings.push("Only one choice found — add at least 2.");
      }
      if (correctIds.length === 0) {
        warnings.push("No correct choice marked.");
      }
      if (type === "single" && correctIds.length > 1) {
        warnings.push(
          "Multiple choices marked correct for a Single choice question — keeping all; switch to Multiple if intended.",
        );
      }

      const question: Question = {
        id,
        type,
        prompt,
        choices,
        correct: correctIds,
        points: Math.max(1, points),
        ...(explanation ? { explanation } : {}),
      };
      results.push({ question, warnings });
      continue;
    }

    if (type === "boolean") {
      const raw = (answerValue ?? "").trim().toLowerCase();
      if (raw === "true" || raw === "false") {
        correct = [raw];
      } else if (raw === "1" || raw === "yes" || raw === "t") {
        correct = ["true"];
        warnings.push(
          `True/False answer "${answerValue ?? raw}" not recognised, defaulted to True.`,
        );
      } else if (raw === "0" || raw === "no" || raw === "f") {
        correct = ["false"];
        warnings.push(
          `True/False answer "${answerValue}" not recognised, defaulted to False.`,
        );
      } else {
        correct = ["true"];
        warnings.push(
          "True/False answer not recognised, defaulted to True.",
        );
      }
    } else {
      // short or gap — split accepted answers on | / ,
      const raw = answerValue ?? "";
      correct = raw
        .split(/[|/,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (correct.length === 0) {
        warnings.push("No accepted answer found.");
      }
    }

    if (type === "gap" && !/_{2,}/.test(prompt)) {
      warnings.push('Mark the blank with ___ in the prompt.');
    }

    const question: Question = {
      id,
      type,
      prompt,
      choices: [],
      correct,
      points: Math.max(1, points),
      ...(explanation ? { explanation } : {}),
    };
    results.push({ question, warnings });
  }

  return results;
}
