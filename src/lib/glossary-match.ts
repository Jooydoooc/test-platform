// Matches a passage token (possibly an inflected form: "workers", "cooler",
// "reduces") back to the glossary row whose lemma is stored in Supabase
// ("worker", "cool", "reduce"). Roughly a third of imported Guardian glossary
// rows never appear in their passage in their exact stored form, so without
// this the words are invisible and uncollectable.
//
// Pure and dependency-free so it's trivially unit-testable: feed it a
// BookGlossaryRow[] and strings, assert on the returned rows/keys.
//
// Precision > recall: a wrong match shows the student the wrong definition,
// which is worse than a missed match (the word is simply not tappable). Every
// heuristic below is written to fail closed — when two different glossary
// entries could plausibly claim the same surface form, neither wins.

import { normalizeWord } from "@/lib/vocab-store";
import type { BookGlossaryRow } from "@/lib/database.types";

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function isConsonant(ch: string): boolean {
  return /^[a-z]$/.test(ch) && !VOWELS.has(ch);
}

/**
 * True when `lemma` ends consonant-vowel-consonant (run, stop, control) and
 * so is a *candidate* for a doubled final consonant before a vowel suffix
 * (running, stopped). Real English doubling also depends on syllable stress
 * ("happen" -> "happening", not doubled) which we have no reliable way to
 * detect from spelling alone, so this is intentionally permissive: callers
 * add the doubled form as one extra candidate alongside the plain one rather
 * than choosing between them.
 */
function hasCvcEnding(lemma: string): boolean {
  if (lemma.length < 3) return false;
  const a = lemma[lemma.length - 3];
  const b = lemma[lemma.length - 2];
  const c = lemma[lemma.length - 1];
  if (!isConsonant(a) || !VOWELS.has(b) || !isConsonant(c)) return false;
  return c !== "w" && c !== "x" && c !== "y"; // these never double
}

/**
 * All regularly-inflected surface forms of a glossary lemma: plural / 3rd
 * person -s, past -ed, present participle -ing, and comparative/superlative
 * -er/-est. Generates a couple of extra "just in case" spellings (e.g. both
 * the doubled and undoubled -ing form) rather than trying to be clever about
 * stress — unused candidates are harmless, since they only ever matter if
 * they collide with real text.
 */
export function generateSurfaceForms(lemma: string): string[] {
  if (!lemma || lemma.length < 2) return [];
  const forms = new Set<string>();
  const last = lemma.slice(-1);
  const last2 = lemma.slice(-2);
  const endsConsonantY = last === "y" && isConsonant(lemma[lemma.length - 2] ?? "");
  const doubled = hasCvcEnding(lemma) ? lemma + last : null;

  // Plural / 3rd-person singular -s (deterministic by final letter — no
  // ambiguity here, unlike doubling).
  if (/[sxz]$/.test(lemma) || /(ch|sh)$/.test(lemma)) {
    forms.add(lemma + "es");
  } else if (endsConsonantY) {
    forms.add(lemma.slice(0, -1) + "ies"); // city -> cities
  } else {
    forms.add(lemma + "s");
  }

  // Past tense -ed
  if (last === "e") {
    forms.add(lemma + "d"); // reduce -> reduced
  } else if (endsConsonantY) {
    forms.add(lemma.slice(0, -1) + "ied"); // carry -> carried
  } else {
    forms.add(lemma + "ed");
    if (doubled) forms.add(doubled + "ed"); // stop -> stopped
  }

  // Present participle -ing
  if (last2 === "ie") {
    forms.add(lemma.slice(0, -2) + "ying"); // tie -> tying
  } else if (last === "e" && !/(ee|oe|ye)$/.test(lemma)) {
    forms.add(lemma.slice(0, -1) + "ing"); // make -> making (drop the e)
  } else {
    forms.add(lemma + "ing");
    if (doubled) forms.add(doubled + "ing"); // run -> running
  }

  // Comparative / superlative -er / -est
  if (last === "e") {
    forms.add(lemma + "r");
    forms.add(lemma + "st");
  } else if (endsConsonantY) {
    forms.add(lemma.slice(0, -1) + "ier"); // easy -> easier
    forms.add(lemma.slice(0, -1) + "iest");
  } else {
    forms.add(lemma + "er"); // cool -> cooler
    forms.add(lemma + "est");
    if (doubled) {
      forms.add(doubled + "er"); // big -> bigger
      forms.add(doubled + "est");
    }
  }

  forms.delete(lemma);
  return [...forms];
}

/**
 * The reverse direction: given an unmatched *token* from the passage, guess
 * lemmas it might reduce to (workers -> worker, running -> run, reducing ->
 * reduce). Used only as a fallback when the forward-generated index (above)
 * didn't already cover the form, and only ever checked against *exact*
 * glossary lemmas — see matchWord.
 */
export function candidateStems(token: string): string[] {
  const stems = new Set<string>();
  const undouble = (base: string): string | null => {
    const a = base[base.length - 1];
    const b = base[base.length - 2];
    return a && b && a === b && isConsonant(a) ? base.slice(0, -1) : null;
  };

  if (token.endsWith("ies") && token.length > 4) stems.add(token.slice(0, -3) + "y");
  if (token.endsWith("es") && token.length > 3) stems.add(token.slice(0, -2));
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 2) {
    stems.add(token.slice(0, -1));
  }

  if (token.endsWith("ied") && token.length > 4) stems.add(token.slice(0, -3) + "y");
  if (token.endsWith("ed") && token.length > 3) {
    const base = token.slice(0, -2);
    stems.add(base); // walked -> walk
    stems.add(base + "e"); // reduced -> reduce
    const un = undouble(base);
    if (un) stems.add(un); // stopped -> stop
  }

  if (token.endsWith("ying") && token.length > 5) stems.add(token.slice(0, -4) + "ie");
  if (token.endsWith("ing") && token.length > 4) {
    const base = token.slice(0, -3);
    stems.add(base); // reading -> read
    stems.add(base + "e"); // making -> make
    const un = undouble(base);
    if (un) stems.add(un); // running -> run
  }

  if (token.endsWith("iest") && token.length > 5) stems.add(token.slice(0, -4) + "y");
  if (token.endsWith("ier") && token.length > 4) stems.add(token.slice(0, -3) + "y");
  if (token.endsWith("est") && token.length > 4) {
    const base = token.slice(0, -3);
    stems.add(base);
    const un = undouble(base);
    if (un) stems.add(un); // biggest -> big
  }
  if (token.endsWith("er") && token.length > 3) {
    const base = token.slice(0, -2);
    stems.add(base);
    const un = undouble(base);
    if (un) stems.add(un); // bigger -> big
  }

  stems.delete(token);
  return [...stems];
}

type IndexEntry = { row: BookGlossaryRow; exact: boolean };

/** normalizeWord(row.word) — the stable "lemma key" used everywhere a
 * collected word needs to be identified (localStorage, Saved sidebar, etc.),
 * regardless of which surface form the student actually tapped. */
export function lemmaKey(row: BookGlossaryRow): string {
  return normalizeWord(row.word);
}

export type GlossaryIndex = Map<string, IndexEntry>;

/**
 * Build a lookup from every surface form (lemma + generated inflections) to
 * its glossary row. Exact lemma spellings always win; if two different
 * lemmas would generate the same inflected surface form (rare, but possible
 * with short words), that form is dropped rather than guessed at.
 */
export function buildGlossaryIndex(glossary: BookGlossaryRow[]): GlossaryIndex {
  const index: GlossaryIndex = new Map();

  // Pass 1: literal glossary spellings, highest priority. If two rows in the
  // same book normalize to the same key (e.g. "lead" noun vs. verb), the
  // first one in the list wins deterministically rather than the last one
  // silently overwriting it.
  for (const row of glossary) {
    const key = lemmaKey(row);
    if (!key) continue;
    if (!index.has(key)) index.set(key, { row, exact: true });
  }

  // Pass 2: generated inflected forms, lowest priority — never override an
  // exact entry, and never resolve a collision between two different rows.
  // Iterate the pass-1 winners rather than the raw list: two rows sharing a
  // lemma would otherwise collide with *each other* and get their shared
  // inflections dropped, making "workers" unmatchable just because "worker"
  // appears twice.
  const winners = [...index.entries()].map(([lemma, entry]) => ({
    lemma,
    row: entry.row,
  }));
  const ambiguous = new Set<string>();
  for (const { lemma, row } of winners) {
    for (const form of generateSurfaceForms(lemma)) {
      const existing = index.get(form);
      if (existing) {
        if (!existing.exact && existing.row !== row) ambiguous.add(form);
        continue; // exact wins; same-row duplicate is a no-op
      }
      if (!ambiguous.has(form)) index.set(form, { row, exact: false });
    }
  }
  for (const form of ambiguous) index.delete(form);

  return index;
}

/**
 * Resolve a passage token to its glossary row, if any. Tries the direct
 * (lemma + generated-form) index first, then falls back to guessing stems of
 * the token itself — but the fallback only ever lands on an *exact* lemma,
 * never on another generated guess, to keep two layers of uncertainty from
 * compounding into a wrong match.
 */
export function matchWord(index: GlossaryIndex, token: string): BookGlossaryRow | null {
  const key = normalizeWord(token);
  if (!key) return null;
  const direct = index.get(key);
  if (direct) return direct.row;
  for (const stem of candidateStems(key)) {
    const hit = index.get(stem);
    if (hit && hit.exact) return hit.row;
  }
  return null;
}
