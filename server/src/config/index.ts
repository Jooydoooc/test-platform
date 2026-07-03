// Tunable platform rules. CLAUDE_RULES.md: these MUST be config, never hardcoded in
// logic, because they need real-world tuning after launch. Import from here — do not
// inline any of these numbers at a call site.

export const config = {
  // --- Vocabulary state machine (VOCABULARY_SYSTEM.md) ---
  vocab: {
    // Learning -> Reviewed at this many total correct.
    reviewedCorrectThreshold: 3,
    // Reviewed -> Mastered: N consecutive correct across >= M separate sessions.
    masteredConsecutiveCorrect: 3,
    masteredDistinctSessions: 2,
    // WEAK if last attempt wrong OR accuracy below this over the last N attempts.
    weakAccuracyThreshold: 0.6,
    weakWindowSize: 5,
    // Review reminders: "Learning" items not practised in this many scheduled-session
    // days resurface (matches streak logic; weak items always come first).
    learningReviewSessionDays: 5,
  },

  // --- "Falling behind" flag (TEACHER_DASHBOARD.md) — explainable, teacher sees WHY ---
  fallingBehind: {
    inactivitySessionDays: 3, // no activity for N scheduled-session days
    decliningTrend: true, // short-term trend must be negative
    minCompletionRate: 0.5, // task completion below this contributes to the flag
  },

  // --- Streaks & activity (scheduled-session days, NOT calendar days) ---
  activity: {
    activeWindowDays: 7, // "active" = login/activity within this window
    // Missing a day with NO scheduled session never breaks the streak; this is the
    // grace applied on scheduled-session days only.
    streakGraceSessions: 0,
  },

  // --- Points (RANKING_AND_MOTIVATION.md) — base values are tunable ---
  points: {
    values: {
      practiceCompleted: 5,
      homeworkCompleted: 10,
      testCompleted: 20,
      extraPracticeCompleted: 3,
      mistakeReviewed: 2, // once per unique mistake only
      vocabWordMastered: 8, // once per word only
      positiveTrend: 15, // only on genuine positive trend, not per attempt
    },
    // Anti-gaming: repeated meaningful actions award points at most this many times.
    // Re-reviewing an already-reviewed mistake or re-practising a mastered word = 0.
    onceOnlyReasons: ["mistakeReviewed", "vocabWordMastered"] as const,
  },

  // --- Leaderboard (RANKING_AND_MOTIVATION.md) — never embarrass ---
  leaderboard: {
    publicTopN: 5, // only top 5 shown publicly per category
    // Student always sees their OWN exact rank privately regardless of this cutoff.
    groupScopedOnly: true,
  },

  // --- Progress trend windows (PROGRESS_TRACKING.md) — two distinct windows ---
  progress: {
    // Short-term trend indicator: latest vs average of previous N attempts.
    trendWindowPrevAttempts: 4,
    // Monthly improvement uses calendar-month buckets, computed per skill.
  },

  // --- AI grading guardrails (Gemini) ---
  aiGrading: {
    provider: "gemini" as const,
    // Actual limits sourced from env (env.ts) — surfaced here for a single import site.
  },
} as const;

export type AppConfig = typeof config;
