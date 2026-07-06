// Vocabulary QuizShell config — plain module (no "use client") so both the
// client QuizShell and the server route pages can import it. Adding another
// MC-style exercise is a new entry in QUIZ_CONFIG, not new code.

export type McExerciseType =
  | "mc_definition"
  | "mc_translation_en_uz"
  | "mc_translation_uz_en"
  | "mc_filling";

export type WordField = "word" | "translation_uz" | "definition_en";

export type QuizConfig = {
  exerciseType: McExerciseType;
  // `example_blanked` is synthesised (a sentence with the word blanked out);
  // every other field is read straight off the word row.
  questionField: WordField | "example_blanked";
  answerField: WordField;
  questionCount: number;
  // Short human label + prompt caption shown above each question.
  label: string;
  caption: string;
};

const DEFAULT_COUNT = 20;

export const QUIZ_CONFIG: Record<McExerciseType, QuizConfig> = {
  mc_definition: {
    exerciseType: "mc_definition",
    questionField: "word",
    answerField: "definition_en",
    questionCount: DEFAULT_COUNT,
    label: "Definitions",
    caption: "Choose the correct definition",
  },
  mc_translation_en_uz: {
    exerciseType: "mc_translation_en_uz",
    questionField: "word",
    answerField: "translation_uz",
    questionCount: DEFAULT_COUNT,
    label: "English → Uzbek",
    caption: "Choose the correct translation",
  },
  mc_translation_uz_en: {
    exerciseType: "mc_translation_uz_en",
    questionField: "translation_uz",
    answerField: "word",
    questionCount: DEFAULT_COUNT,
    label: "Uzbek → English",
    caption: "Choose the correct English word",
  },
  mc_filling: {
    exerciseType: "mc_filling",
    questionField: "example_blanked",
    answerField: "word",
    questionCount: DEFAULT_COUNT,
    label: "Fill the gap",
    caption: "Choose the word that fits the sentence",
  },
};

export function isMcExerciseType(v: string): v is McExerciseType {
  return v in QUIZ_CONFIG;
}
