// Client-side parsing for uploaded books. No dependencies — a small quote-aware
// CSV reader plus two typed row mappers. PDF/Word extraction is a later phase;
// these cover Text + CSV.

import type { QuestionType } from "@/lib/types";

// --- CSV -------------------------------------------------------------------

/**
 * Parse CSV text into rows of cells. Handles quoted fields (with escaped ""),
 * commas and newlines inside quotes, and trailing newlines. Not a full RFC 4180
 * implementation, but robust for hand-made spreadsheets exported as CSV.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // Normalise line endings so \r\n and \r behave like \n.
  const src = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  // Flush the final cell/row unless the input ended on a clean newline.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Drop fully-empty rows and trim every cell. */
function cleanRows(rows: string[][]): string[][] {
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
}

/** Map header names → column index (case-insensitive), for flexible column order. */
function headerIndex(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    map[h.trim().toLowerCase()] = i;
  });
  return map;
}

// --- Questions -------------------------------------------------------------

export type ParsedQuestion = {
  type: QuestionType;
  prompt: string;
  choices: string[];
  correct: string[];
  points: number;
};

export type ParseResult<T> = { items: T[]; errors: string[] };

const QUESTION_TYPES: QuestionType[] = [
  "single",
  "multiple",
  "boolean",
  "short",
  "gap",
];

/** Split a pipe-separated cell into trimmed, non-empty parts. */
function splitList(cell: string | undefined): string[] {
  return (cell ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse a questions CSV. Header (any order, case-insensitive):
 *   type, prompt, choices, correct, points
 * - type:    single | multiple | boolean | short | gap
 * - choices: pipe-separated (single/multiple only)
 * - correct: pipe-separated. For single/multiple, either 1-based indices into
 *            `choices` or the exact choice text. For boolean: true|false.
 *            For short/gap: accepted answer strings.
 * - points:  optional integer (default 1)
 */
export function parseQuestionsCsv(text: string): ParseResult<ParsedQuestion> {
  const rows = cleanRows(parseCsv(text));
  const errors: string[] = [];
  if (rows.length < 2) {
    return { items: [], errors: ["CSV needs a header row and at least one question."] };
  }
  const idx = headerIndex(rows[0]);
  for (const req of ["type", "prompt"]) {
    if (!(req in idx)) errors.push(`Missing required column "${req}".`);
  }
  if (errors.length) return { items: [], errors };

  const items: ParsedQuestion[] = [];
  for (let r = 1; r < rows.length; r++) {
    const line = r + 1; // 1-based, accounting for header
    const cells = rows[r];
    const get = (k: string) => (k in idx ? cells[idx[k]] : undefined);

    const rawType = (get("type") ?? "").toLowerCase() as QuestionType;
    if (!QUESTION_TYPES.includes(rawType)) {
      errors.push(`Row ${line}: unknown type "${get("type")}".`);
      continue;
    }
    const prompt = get("prompt") ?? "";
    if (!prompt) {
      errors.push(`Row ${line}: empty prompt.`);
      continue;
    }
    const points = Math.max(1, Math.floor(Number(get("points")) || 1));
    const choices = splitList(get("choices"));
    let correct = splitList(get("correct"));

    if (rawType === "single" || rawType === "multiple") {
      if (choices.length < 2) {
        errors.push(`Row ${line}: ${rawType} needs at least 2 choices.`);
        continue;
      }
      // Resolve numeric (1-based) correct references to choice text.
      correct = correct.map((c) => {
        const n = Number(c);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
          return choices[n - 1];
        }
        return c;
      });
      const unknown = correct.filter((c) => !choices.includes(c));
      if (correct.length === 0 || unknown.length > 0) {
        errors.push(`Row ${line}: correct answer must match a choice.`);
        continue;
      }
      if (rawType === "single" && correct.length !== 1) {
        errors.push(`Row ${line}: single choice needs exactly one correct answer.`);
        continue;
      }
    } else if (rawType === "boolean") {
      const v = (correct[0] ?? "").toLowerCase();
      if (v !== "true" && v !== "false") {
        errors.push(`Row ${line}: boolean correct must be true or false.`);
        continue;
      }
      correct = [v];
    } else {
      // short / gap
      if (correct.length === 0) {
        errors.push(`Row ${line}: ${rawType} needs at least one accepted answer.`);
        continue;
      }
    }

    items.push({
      type: rawType,
      prompt,
      choices: rawType === "single" || rawType === "multiple" ? choices : [],
      correct,
      points,
    });
  }

  return { items, errors };
}

// --- Glossary --------------------------------------------------------------

export type ParsedGlossaryWord = {
  word: string;
  definition_en: string;
  translation_uz: string;
  example: string;
};

/**
 * Parse a glossary CSV. Header (any order, case-insensitive):
 *   word, definition, translation, example
 * Only `word` is required; the rest default to empty.
 */
export function parseGlossaryCsv(text: string): ParseResult<ParsedGlossaryWord> {
  const rows = cleanRows(parseCsv(text));
  const errors: string[] = [];
  if (rows.length < 2) {
    return { items: [], errors: ["CSV needs a header row and at least one word."] };
  }
  const idx = headerIndex(rows[0]);
  if (!("word" in idx)) {
    return { items: [], errors: ['Missing required column "word".'] };
  }

  const items: ParsedGlossaryWord[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const cells = rows[r];
    const get = (k: string) => (k in idx ? (cells[idx[k]] ?? "").trim() : "");
    const word = get("word");
    if (!word) {
      errors.push(`Row ${line}: empty word.`);
      continue;
    }
    const key = word.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Row ${line}: duplicate word "${word}" (skipped).`);
      continue;
    }
    seen.add(key);
    items.push({
      word,
      definition_en: get("definition"),
      translation_uz: get("translation"),
      example: get("example"),
    });
  }

  return { items, errors };
}

// --- Files -----------------------------------------------------------------

/** Read a .txt / .md file as UTF-8 text. */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// --- Templates (downloadable examples shown in the upload UI) ---------------

export const QUESTIONS_CSV_TEMPLATE =
  "type,prompt,choices,correct,points\n" +
  'single,"What is the capital of France?",London|Paris|Rome,2,1\n' +
  'multiple,"Which are fruits?",Apple|Carrot|Banana,Apple|Banana,1\n' +
  "boolean,The sky is blue.,,true,1\n" +
  'gap,"She ___ to school.",,goes,1\n' +
  'short,"Formula for water?",,H2O|water,1\n';

export const GLOSSARY_CSV_TEMPLATE =
  "word,definition,translation,example\n" +
  'arrive,"to get somewhere","yetib kelmoq","We arrive at school by eight."\n' +
  'enjoy,"to like something","zavqlanmoq","I enjoy playing football."\n';
