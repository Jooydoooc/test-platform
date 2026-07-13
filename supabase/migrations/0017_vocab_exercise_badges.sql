-- Vocab practice-drill badges: reward completing vocabulary practice exercises.
--
-- These use the new `vocab_exercises` metric (client catalog src/lib/badges.ts),
-- sourced server-side from the count of VOCAB_EXERCISE_EXP points_ledger rows —
-- each row is one distinct (unit, drill type) completion, deduped at award time.
-- The badges table stores no metric column; the catalog code is the join key
-- (see evaluateAndUnlockBadges), so we only need matching code rows here.
--
-- Thresholds mirror the skill Bronze/Silver/Gold ladder (5 / 15 / 30). Max
-- attainable is 40 (5 seeded EEW units × 8 drill types). skill_area = VOCABULARY
-- groups them under vocabulary in the badge UI (display only; the metric, not
-- skill_area, drives unlocking for this badge family).

insert into badges (code, name, description, skill_area, threshold) values
  ('vocab_practice_bronze', 'Word Driller', 'Complete 5 vocabulary practice drills.',  'VOCABULARY', 5),
  ('vocab_practice_silver', 'Word Grinder', 'Complete 15 vocabulary practice drills.', 'VOCABULARY', 15),
  ('vocab_practice_gold',   'Word Master',  'Complete 30 vocabulary practice drills.', 'VOCABULARY', 30)
on conflict (code) do nothing;
