// Vocabulary QuizShell config — plain module (no "use client") so both the
// client QuizShell and the server route pages can import it. Adding another
// MC-style exercise is a new entry in QUIZ_CONFIG, not new code.

export type McExerciseType =
  | "mc_definition"
  | "mc_definition_reverse"
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
    label: "Word → Definition",
    caption: "Choose the correct definition",
  },
  mc_definition_reverse: {
    exerciseType: "mc_definition_reverse",
    questionField: "definition_en",
    answerField: "word",
    questionCount: DEFAULT_COUNT,
    label: "Definition → Word",
    caption: "Choose the word for this meaning",
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

// --- interactive (non-multiple-choice) exercises ---------------------------
// These need their own UI beyond the option-picker QuizShell, so they live in
// dedicated components. Each still runs over the same VocabWord list and logs
// progress through saveVocabProgress, keyed by the type below.

export type InteractiveExerciseType =
  | "gap_fill_typed"
  | "sentence_builder"
  | "match_words";

export type InteractiveConfig = {
  exerciseType: InteractiveExerciseType;
  questionCount: number;
  label: string;
  caption: string;
};

export const INTERACTIVE_CONFIG: Record<
  InteractiveExerciseType,
  InteractiveConfig
> = {
  gap_fill_typed: {
    exerciseType: "gap_fill_typed",
    questionCount: DEFAULT_COUNT,
    label: "Gap filling",
    caption: "Type the missing word",
  },
  sentence_builder: {
    exerciseType: "sentence_builder",
    questionCount: 10,
    label: "Make the sentence",
    caption: "Put the words in the correct order",
  },
  match_words: {
    exerciseType: "match_words",
    questionCount: 5, // words per matching round
    label: "Matching",
    caption: "Match each word to its sentence",
  },
};

export function isInteractiveExerciseType(
  v: string,
): v is InteractiveExerciseType {
  return v in INTERACTIVE_CONFIG;
}

/** Any drill type — multiple-choice or interactive. */
export type AnyExerciseType = McExerciseType | InteractiveExerciseType;

/** Every drill type, in the order they should appear on a unit's hub. */
export const ALL_EXERCISE_ORDER: (McExerciseType | InteractiveExerciseType)[] = [
  "mc_translation_en_uz",
  "mc_translation_uz_en",
  "mc_definition",
  "mc_definition_reverse",
  "gap_fill_typed",
  "mc_filling",
  "sentence_builder",
  "match_words",
];
