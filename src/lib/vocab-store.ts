"use client";

// localStorage-backed vocabulary data for the QuizShell, matching how the rest
// of the running prototype works (see store.ts). The words are a static seed;
// only quiz progress is persisted. Swappable for the Supabase `words` /
// `user_progress` tables (migration 0004) once the backend is live.

import type { McExerciseType } from "@/lib/vocab";

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

// --- seed: Essential Words Book 1, Unit 1 (fully enriched) -----------------

type Seed = Omit<VocabWord, "id" | "unit_id">;

const UNIT1: Seed[] = [
  { word: "agree", part_of_speech: "v.", definition_en: "to have the same opinion or belief as another person", translation_uz: "rozi bo‘lmoq", examples: ["I agree with your plan.", "They did not agree on a price."] },
  { word: "alcohol", part_of_speech: "n.", definition_en: "a type of drink that can make people drunk", translation_uz: "alkogol, spirtli ichimlik", examples: ["He never drinks alcohol.", "This drink contains no alcohol."] },
  { word: "arrive", part_of_speech: "v.", definition_en: "to get somewhere", translation_uz: "yetib kelmoq", examples: ["We arrive at school by eight.", "What time does the train arrive?"] },
  { word: "August", part_of_speech: "n.", definition_en: "the eighth month of the year", translation_uz: "avgust", examples: ["My birthday is in August.", "We travel every August."] },
  { word: "boat", part_of_speech: "n.", definition_en: "a vehicle that moves across water", translation_uz: "qayiq", examples: ["They crossed the lake by boat.", "The boat is very small."] },
  { word: "breakfast", part_of_speech: "n.", definition_en: "the morning meal", translation_uz: "nonushta", examples: ["I eat breakfast at seven.", "She made a big breakfast."] },
  { word: "camera", part_of_speech: "n.", definition_en: "a piece of equipment that takes pictures", translation_uz: "kamera, fotoapparat", examples: ["He bought a new camera.", "Please bring your camera."] },
  { word: "capital", part_of_speech: "n.", definition_en: "a city where a country’s government is based", translation_uz: "poytaxt", examples: ["Paris is the capital of France.", "Tokyo is a large capital."] },
  { word: "catch", part_of_speech: "v.", definition_en: "to grab or get something", translation_uz: "ushlamoq, ilib olmoq", examples: ["Try to catch the ball.", "The cat likes to catch mice."] },
  { word: "duck", part_of_speech: "n.", definition_en: "a small water bird", translation_uz: "o‘rdak", examples: ["A duck swam across the pond.", "The children fed the duck."] },
  { word: "enjoy", part_of_speech: "v.", definition_en: "to like something", translation_uz: "zavqlanmoq, yoqmoq", examples: ["I enjoy playing football.", "They enjoy the warm weather."] },
  { word: "invite", part_of_speech: "v.", definition_en: "to ask someone to come to a place or event", translation_uz: "taklif qilmoq", examples: ["Let’s invite them to dinner.", "She will invite all her friends."] },
  { word: "love", part_of_speech: "v.", definition_en: "to like something or someone a lot", translation_uz: "sevmoq, yaxshi ko‘rmoq", examples: ["I love this song.", "They love their new house."] },
  { word: "month", part_of_speech: "n.", definition_en: "one of 12 periods of time in one year", translation_uz: "oy", examples: ["We meet once a month.", "This month has been busy."] },
  { word: "travel", part_of_speech: "v.", definition_en: "to go to a faraway place on vacation or business", translation_uz: "sayohat qilmoq", examples: ["I love to travel abroad.", "They travel by train."] },
  { word: "typical", part_of_speech: "adj.", definition_en: "normal, or something that usually happens", translation_uz: "odatiy, tipik", examples: ["It was a typical winter day.", "That is typical of him."] },
  { word: "visit", part_of_speech: "v.", definition_en: "to go and spend time in another place or see another person", translation_uz: "tashrif buyurmoq", examples: ["We visit our grandparents often.", "I want to visit Rome."] },
  { word: "weather", part_of_speech: "n.", definition_en: "the temperature and the state of the outdoors", translation_uz: "ob-havo", examples: ["The weather is nice today.", "Bad weather stopped the game."] },
  { word: "week", part_of_speech: "n.", definition_en: "a period of time that is seven days long", translation_uz: "hafta", examples: ["See you next week.", "The course lasts one week."] },
  { word: "wine", part_of_speech: "n.", definition_en: "an alcoholic drink made from grapes", translation_uz: "vino, uzum sharobi", examples: ["He poured a glass of wine.", "This wine is from Italy."] },
];

// Stable ids keep React keys and progress rows consistent across reloads.
function buildUnit(id: string, title: string, seed: Seed[]): VocabUnit {
  return {
    id,
    title,
    words: seed.map((s, i) => ({ ...s, id: `${id}-w${i + 1}`, unit_id: id })),
  };
}

const UNITS: VocabUnit[] = [
  buildUnit("eew1-u1", "Essential Words — Unit 1", UNIT1),
];

// --- read API --------------------------------------------------------------

export function listVocabUnits(): { id: string; title: string; wordCount: number }[] {
  return UNITS.map((u) => ({ id: u.id, title: u.title, wordCount: u.words.length }));
}

export function getVocabUnit(unitId: string): VocabUnit | undefined {
  return UNITS.find((u) => u.id === unitId);
}

export function getVocabWords(unitId: string): VocabWord[] {
  return getVocabUnit(unitId)?.words ?? [];
}

// --- progress (localStorage) ----------------------------------------------

const PROGRESS_KEY = "tp.vocab.progress";

export type VocabProgress = {
  unitId: string;
  exerciseType: McExerciseType;
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
  exerciseType: McExerciseType,
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
