"use client";

// localStorage-backed vocabulary data for the QuizShell, matching how the rest
// of the running prototype works (see store.ts). The words are a static seed;
// only quiz progress is persisted. Swappable for the Supabase `words` /
// `user_progress` tables (migration 0004) once the backend is live.

import { useEffect, useState } from "react";
import type { AnyExerciseType } from "@/lib/vocab";
import { ESSENTIAL_WORDS_BOOK1 } from "@/lib/data/essential-words";

export type VocabWord = {
  id: string;
  unit_id: string;
  word: string;
  part_of_speech: string | null;
  definition_en: string;
  translation_uz: string;
  examples: string[]; // sentences containing the word (used by mc_filling)
};

export type VocabUnit = {
  id: string;
  title: string;
  words: VocabWord[];
};

// --- seed: 4000 Essential Words, Book 1 (Units 1–5, fully enriched) ---------
// Word data lives in one shared file (src/lib/data/essential-words.ts) so the
// drills here and the Books quiz (store.ts) never drift apart.

type Seed = Omit<VocabWord, "id" | "unit_id">;

// Unit 1's word list, reused as the target dictionary for the "A Family Trip"
// reading passage below.
const UNIT1: Seed[] =
  ESSENTIAL_WORDS_BOOK1.find((u) => u.unit === 1)?.words ?? [];

// Stable ids keep React keys and progress rows consistent across reloads.
function buildUnit(id: string, title: string, seed: Seed[]): VocabUnit {
  return {
    id,
    title,
    words: seed.map((s, i) => ({ ...s, id: `${id}-w${i + 1}`, unit_id: id })),
  };
}

// One drillable source per book unit: eew1-u1 … eew1-u5.
const UNITS: VocabUnit[] = ESSENTIAL_WORDS_BOOK1.map((u) =>
  buildUnit(`eew1-u${u.unit}`, `Essential Words — Unit ${u.unit}`, u.words),
);

// --- reading passages ------------------------------------------------------
// The Vocabulary section: students read a passage and double-tap the words
// they want to learn. Each passage ships a dictionary of "target" words that
// already carry definition/translation/examples, so the words a student
// collects are immediately drillable in Practice — no backend needed.

export type ReadingPassage = {
  id: string;
  title: string;
  level: string;
  text: string;
  /** Learnable words in this passage, keyed by their normalised form. */
  targets: Record<string, Seed>;
};

// Second passage's target words (the first reuses the enriched UNIT1 set).
const PASSAGE2: Seed[] = [
  { word: "city", part_of_speech: "n.", definition_en: "a large and important town", translation_uz: "shahar", examples: ["We live in a big city.", "The city is very busy."] },
  { word: "market", part_of_speech: "n.", definition_en: "a place where people buy and sell things", translation_uz: "bozor", examples: ["She went to the market.", "The market opens early."] },
  { word: "buy", part_of_speech: "v.", definition_en: "to get something by paying money", translation_uz: "sotib olmoq", examples: ["I want to buy bread.", "They buy fruit every day."] },
  { word: "cheap", part_of_speech: "adj.", definition_en: "not costing a lot of money", translation_uz: "arzon", examples: ["This bag is very cheap.", "We found a cheap hotel."] },
  { word: "expensive", part_of_speech: "adj.", definition_en: "costing a lot of money", translation_uz: "qimmat", examples: ["That car is too expensive.", "Books can be expensive."] },
  { word: "money", part_of_speech: "n.", definition_en: "coins and paper used to buy things", translation_uz: "pul", examples: ["I have no money.", "She saves her money."] },
  { word: "bus", part_of_speech: "n.", definition_en: "a large vehicle that carries many people", translation_uz: "avtobus", examples: ["I take the bus to work.", "The bus was full."] },
  { word: "ticket", part_of_speech: "n.", definition_en: "a small paper that lets you travel or enter", translation_uz: "chipta", examples: ["Buy a ticket first.", "He lost his ticket."] },
  { word: "early", part_of_speech: "adv.", definition_en: "before the usual or expected time", translation_uz: "erta", examples: ["We arrived early.", "She wakes up early."] },
  { word: "late", part_of_speech: "adj.", definition_en: "after the usual or expected time", translation_uz: "kech", examples: ["Sorry, I am late.", "The train is late."] },
  { word: "hungry", part_of_speech: "adj.", definition_en: "wanting to eat", translation_uz: "och", examples: ["I am very hungry.", "The children are hungry."] },
  { word: "tired", part_of_speech: "adj.", definition_en: "needing rest or sleep", translation_uz: "charchagan", examples: ["I feel tired today.", "They were tired after the trip."] },
];

/** Normalise a token to its lookup key: lowercase, letters/apostrophes only. */
export function normalizeWord(token: string): string {
  return token.toLowerCase().replace(/[^a-z']/g, "").replace(/^'+|'+$/g, "");
}

function buildTargets(seed: Seed[]): Record<string, Seed> {
  const map: Record<string, Seed> = {};
  for (const s of seed) map[normalizeWord(s.word)] = s;
  return map;
}

const PASSAGES: ReadingPassage[] = [
  {
    id: "rp-1",
    title: "A Family Trip",
    level: "Beginner",
    targets: buildTargets(UNIT1),
    text: "Every August my family and I love to travel. Last week we decided to visit my uncle, who lives in the capital. We agree that a typical trip should start early, so we eat a big breakfast and arrive at the station before the sun is high. The weather that month was perfect. My uncle likes to invite everyone to the lake, where we catch a small boat and watch a duck swim past. He never drinks alcohol or wine, but he always brings his camera to enjoy the view and take pictures of the whole week.",
  },
  {
    id: "rp-2",
    title: "Morning in the City",
    level: "Beginner",
    targets: buildTargets(PASSAGE2),
    text: "Every morning I wake up early and take the bus to the city. I buy a ticket at the station and find a seat by the window. The city market is my favourite place. Some things there are cheap, but others are very expensive, so I must be careful with my money. By noon I am hungry and tired, and if I am late, the market is already full of people.",
  },
];

// --- read API --------------------------------------------------------------

export function listReadingPassages(): {
  id: string;
  title: string;
  level: string;
  wordCount: number;
}[] {
  return PASSAGES.map((p) => ({
    id: p.id,
    title: p.title,
    level: p.level,
    wordCount: Object.keys(p.targets).length,
  }));
}

export function getReadingPassage(id: string): ReadingPassage | undefined {
  return PASSAGES.find((p) => p.id === id);
}

export function listVocabUnits(): { id: string; title: string; wordCount: number }[] {
  return UNITS.map((u) => ({ id: u.id, title: u.title, wordCount: u.words.length }));
}

export function getVocabUnit(unitId: string): VocabUnit | undefined {
  return UNITS.find((u) => u.id === unitId);
}

/**
 * Words for a drill source. Seeded units return their fixed list; a reading
 * passage returns the words the student has collected from it. This lets the
 * shared QuizShell drive both without changes.
 */
export function getVocabWords(sourceId: string): VocabWord[] {
  const unit = getVocabUnit(sourceId);
  if (unit) return unit.words;
  // Seeded reading passages and uploaded books both resolve to the words the
  // student has collected from that source.
  return getCollectedWords(sourceId);
}

// --- progress (localStorage) ----------------------------------------------

const PROGRESS_KEY = "tp.vocab.progress";

export type VocabProgress = {
  unitId: string;
  exerciseType: AnyExerciseType;
  score: number;
  total: number;
  attemptNumber: number;
  completedAt: number;
};

function readProgress(): VocabProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as VocabProgress[]) : [];
  } catch {
    return [];
  }
}

/** Log one attempt with an incremented attempt_number; returns that number. */
export function saveVocabProgress(
  unitId: string,
  exerciseType: AnyExerciseType,
  score: number,
  total: number,
): number {
  const all = readProgress();
  const prior = all
    .filter((p) => p.unitId === unitId && p.exerciseType === exerciseType)
    .reduce((max, p) => Math.max(max, p.attemptNumber), 0);
  const attemptNumber = prior + 1;
  all.push({ unitId, exerciseType, score, total, attemptNumber, completedAt: Date.now() });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("tp.change"));
  }
  return attemptNumber;
}

// --- collected words (localStorage) ----------------------------------------
// The student's personal vocabulary, grouped by the passage each word came
// from. Swappable for the Supabase `user_progress` / `words` tables later.

const COLLECTION_KEY = "tp.vocab.collection";

// Word data carried on a collected entry for sources without a local target
// dictionary (uploaded Supabase books), so drills work without a refetch.
export type ExternalWordData = {
  word: string;
  definition_en: string;
  translation_uz: string;
  example: string;
  part_of_speech?: string | null;
};

export type CollectedEntry = {
  passageId: string; // source id: a seeded passage (rp-*) or an uploaded book id
  wordKey: string;
  addedAt: number;
  // Present for uploaded-book sources; seeded passages resolve data from targets.
  data?: ExternalWordData;
  sourceTitle?: string;
};

function readCollection(): CollectedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COLLECTION_KEY);
    return raw ? (JSON.parse(raw) as CollectedEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCollection(all: CollectedEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLLECTION_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("tp.change"));
}

export function isCollected(passageId: string, wordKey: string): boolean {
  return readCollection().some(
    (e) => e.passageId === passageId && e.wordKey === wordKey,
  );
}

/**
 * Add a word to the passage's collection. Only words that exist in the
 * passage's target dictionary are accepted (so every collected word stays
 * drillable). Returns true if a new word was added.
 */
export function addCollectedWord(passageId: string, wordKey: string): boolean {
  const passage = getReadingPassage(passageId);
  if (!passage || !passage.targets[wordKey]) return false;
  const all = readCollection();
  if (all.some((e) => e.passageId === passageId && e.wordKey === wordKey)) {
    return false;
  }
  all.push({ passageId, wordKey, addedAt: Date.now() });
  writeCollection(all);
  return true;
}

export function removeCollectedWord(passageId: string, wordKey: string): void {
  const all = readCollection();
  const next = all.filter(
    (e) => !(e.passageId === passageId && e.wordKey === wordKey),
  );
  if (next.length !== all.length) writeCollection(next);
}

/** Collected entries for one passage, oldest first. */
export function getCollectedEntries(passageId: string): CollectedEntry[] {
  return readCollection()
    .filter((e) => e.passageId === passageId)
    .sort((a, b) => a.addedAt - b.addedAt);
}

/** Collected words for one source, from its target dictionary or stored data. */
export function getCollectedWords(passageId: string): VocabWord[] {
  const passage = getReadingPassage(passageId);
  return getCollectedEntries(passageId)
    .map((e): VocabWord | null => {
      const id = `${passageId}-${e.wordKey}`;
      if (e.data) {
        return {
          id,
          unit_id: passageId,
          word: e.data.word,
          part_of_speech: e.data.part_of_speech ?? null,
          definition_en: e.data.definition_en,
          translation_uz: e.data.translation_uz,
          examples: e.data.example ? [e.data.example] : [],
        };
      }
      const seed = passage?.targets[e.wordKey];
      if (!seed) return null;
      return { ...seed, id, unit_id: passageId };
    })
    .filter((w): w is VocabWord => w !== null);
}

/**
 * Save a word collected from an uploaded book (which has no local target
 * dictionary). The word's data + the book title travel with the entry.
 */
export function addExternalWord(
  sourceId: string,
  sourceTitle: string,
  data: ExternalWordData,
): boolean {
  const wordKey = normalizeWord(data.word);
  if (!wordKey) return false;
  const all = readCollection();
  if (all.some((e) => e.passageId === sourceId && e.wordKey === wordKey)) {
    return false;
  }
  all.push({ passageId: sourceId, wordKey, addedAt: Date.now(), data, sourceTitle });
  writeCollection(all);
  return true;
}

/** Display title for a drill source (seeded passage or collected book). */
export function getSourceTitle(sourceId: string): string {
  const unit = getVocabUnit(sourceId);
  if (unit) return unit.title;
  const passage = getReadingPassage(sourceId);
  if (passage) return passage.title;
  const entry = readCollection().find((e) => e.passageId === sourceId);
  return entry?.sourceTitle ?? "Saved words";
}

/** Passages the student has collected from, with their word counts. */
export function listCollections(): {
  passageId: string;
  title: string;
  wordCount: number;
}[] {
  const order: string[] = [];
  const info = new Map<string, { count: number; title: string }>();
  for (const e of readCollection()) {
    const cur = info.get(e.passageId);
    if (cur) {
      cur.count += 1;
    } else {
      order.push(e.passageId);
      info.set(e.passageId, {
        count: 1,
        title: getReadingPassage(e.passageId)?.title ?? e.sourceTitle ?? "Saved words",
      });
    }
  }
  return order.map((passageId) => ({
    passageId,
    title: info.get(passageId)!.title,
    wordCount: info.get(passageId)!.count,
  }));
}

/** Reactive `listCollections()` — refreshes on any `tp.change`/`storage`. */
export function useCollections(): ReturnType<typeof listCollections> {
  const [value, setValue] = useState<ReturnType<typeof listCollections>>([]);
  useEffect(() => {
    const refresh = () => setValue(listCollections());
    refresh();
    window.addEventListener("tp.change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("tp.change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return value;
}
