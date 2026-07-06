// Supabase schema types.
//
// This is a hand-authored subset covering the tables the app code touches today.
// Regenerate the FULL, exact file (all 27 tables) once the project exists with:
//   supabase gen types typescript --linked > src/lib/database.types.ts
// Keep this file until then so the typed clients compile.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Role = "STUDENT" | "TEACHER" | "ADMIN";
export type Level =
  | "BEGINNER"
  | "ELEMENTARY"
  | "PRE_IELTS"
  | "IELTS_INTRODUCTION"
  | "IELTS_GRADUATION";
export type SkillArea =
  | "GRAMMAR"
  | "VOCABULARY"
  | "READING"
  | "LISTENING"
  | "WRITING"
  | "SPEAKING";
export type TaskCategory = "PRACTICE" | "HOMEWORK" | "TEST" | "EXTRA_PRACTICE";
export type QuestionFormat =
  | "MULTIPLE_CHOICE_SINGLE"
  | "MULTIPLE_CHOICE_MULTI"
  | "GAP_FILL"
  | "MATCHING"
  | "REORDERING"
  | "TRANSLATION_UZ_EN"
  | "VOCAB_EXAMPLE_SENTENCE"
  | "WRITING_SENTENCE"
  | "WRITING_EXTENDED"
  | "SPEAKING_AUDIO"
  | "SHORT_ANSWER"
  | "TRUE_FALSE";
export type TestSkillScope =
  | "GRAMMAR"
  | "VOCABULARY"
  | "READING"
  | "LISTENING"
  | "MIXED";
export type TestPurpose = "UNIT" | "MONTHLY" | "PLACEMENT" | "CUSTOM";
export type ResultStatus = "COMPLETED" | "PENDING_REVIEW";

type Timestamps = { created_at: string; updated_at: string };

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  role: Role;
  first_name: string;
  last_name: string;
  group_id: string | null;
  last_active_at: string | null;
} & Timestamps;

export type GroupRow = {
  id: string;
  name: string;
  level: Level;
  owner_id: string | null;
} & Timestamps;

export type TestRow = {
  id: string;
  title: string;
  description: string;
  skill_scope: TestSkillScope;
  purpose: TestPurpose;
  level: Level | null;
  group_id: string | null;
  time_limit_sec: number | null;
  created_by: string;
} & Timestamps;

export type TaskRow = {
  id: string;
  title: string;
  category: TaskCategory;
  skill_area: SkillArea;
  unit_id: string | null;
  lesson_id: string | null;
  instructions: string | null;
  teacher_notes: string | null;
  time_limit_sec: number | null;
  created_by: string;
} & Timestamps;

export type QuestionRow = {
  id: string;
  task_id: string;
  order: number;
  format: QuestionFormat;
  skill_area: SkillArea;
  prompt: string;
  content: Json;
  answer_key: Json;
  points: number;
};

export type TestItemRow = {
  id: string;
  test_id: string;
  task_id: string;
  order: number;
};

export type AttemptRow = {
  id: string;
  student_id: string;
  task_id: string | null;
  test_id: string | null;
  started_at: string;
  submitted_at: string | null;
};

export type AttemptAnswerRow = {
  id: string;
  attempt_id: string;
  question_id: string;
  response: Json;
  is_correct: boolean | null;
  awarded_points: number;
  needs_teacher_check: boolean;
  ai_feedback: string | null;
};

export type ResultRow = {
  id: string;
  attempt_id: string;
  student_id: string;
  status: ResultStatus;
  excluded_from_progress: boolean;
  created_at: string;
};

export type ResultSkillScoreRow = {
  id: string;
  result_id: string;
  skill_area: SkillArea;
  correct_count: number;
  total_count: number;
  accuracy: number;
};

export type UnitRow = {
  id: string;
  textbook_id: string;
  title: string;
  order: number;
};

// Standalone vocab-quiz model (migration 0004) — separate from vocabulary_items.
export type WordRow = {
  id: string;
  unit_id: string;
  word: string;
  part_of_speech: string | null;
  definition_en: string;
  translation_uz: string;
  examples: Json; // string[] at runtime
  created_at: string;
};

export type UserProgressRow = {
  id: string;
  user_id: string;
  unit_id: string;
  exercise_type: string;
  score: number;
  total: number;
  attempt_number: number;
  completed_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      groups: Table<GroupRow>;
      tests: Table<TestRow>;
      tasks: Table<TaskRow>;
      questions: Table<QuestionRow>;
      test_items: Table<TestItemRow>;
      attempts: Table<AttemptRow>;
      attempt_answers: Table<AttemptAnswerRow>;
      results: Table<ResultRow>;
      result_skill_scores: Table<ResultSkillScoreRow>;
      units: Table<UnitRow>;
      words: Table<WordRow>;
      user_progress: Table<UserProgressRow>;
    };
    Views: Record<string, never>;
    Functions: {
      group_leaderboard: {
        Args: Record<string, never>;
        Returns: {
          student_id: string;
          display_name: string;
          avg_accuracy: number;
          results_count: number;
          is_me: boolean;
        }[];
      };
    };
    Enums: {
      role: Role;
      level: Level;
      skill_area: SkillArea;
      task_category: TaskCategory;
      question_format: QuestionFormat;
      test_skill_scope: TestSkillScope;
      test_purpose: TestPurpose;
      result_status: ResultStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
