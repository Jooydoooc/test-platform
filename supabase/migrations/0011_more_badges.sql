-- Expand the badge catalog into progression ladders so students always have a
-- next rung to chase (retention). No schema change — the generic milestone
-- pattern means new badges are just rows. The metric that feeds each badge lives
-- in the app catalog (src/lib/badges.ts); the DB stores identity + threshold and
-- is the source of truth for badge ids. Idempotent via on conflict (code).
insert into badges (code, name, description, skill_area, threshold) values
  -- Per-skill Bronze/Silver/Gold tiers (starters already seeded in 0001).
  ('grammar_bronze',    'Grammar Bronze',     'Complete 5 grammar tests.',      'GRAMMAR', 5),
  ('grammar_silver',    'Grammar Silver',     'Complete 15 grammar tests.',     'GRAMMAR', 15),
  ('grammar_gold',      'Grammar Gold',       'Complete 30 grammar tests.',     'GRAMMAR', 30),
  ('vocabulary_bronze', 'Vocabulary Bronze',  'Complete 5 vocabulary tests.',   'VOCABULARY', 5),
  ('vocabulary_silver', 'Vocabulary Silver',  'Complete 15 vocabulary tests.',  'VOCABULARY', 15),
  ('vocabulary_gold',   'Vocabulary Gold',    'Complete 30 vocabulary tests.',  'VOCABULARY', 30),
  ('reading_bronze',    'Reading Bronze',     'Complete 5 reading tests.',      'READING', 5),
  ('reading_silver',    'Reading Silver',     'Complete 15 reading tests.',     'READING', 15),
  ('reading_gold',      'Reading Gold',       'Complete 30 reading tests.',     'READING', 30),
  ('listening_bronze',  'Listening Bronze',   'Complete 5 listening tests.',    'LISTENING', 5),
  ('listening_silver',  'Listening Silver',   'Complete 15 listening tests.',   'LISTENING', 15),
  ('listening_gold',    'Listening Gold',     'Complete 30 listening tests.',   'LISTENING', 30),
  ('writing_bronze',    'Writing Bronze',     'Complete 5 writing tasks.',      'WRITING', 5),
  ('writing_silver',    'Writing Silver',     'Complete 15 writing tasks.',     'WRITING', 15),
  ('writing_gold',      'Writing Gold',       'Complete 30 writing tasks.',     'WRITING', 30),
  ('speaking_bronze',   'Speaking Bronze',    'Complete 5 speaking tasks.',     'SPEAKING', 5),
  ('speaking_silver',   'Speaking Silver',    'Complete 15 speaking tasks.',    'SPEAKING', 15),
  ('speaking_gold',     'Speaking Gold',      'Complete 30 speaking tasks.',    'SPEAKING', 30),
  -- Streak ladder (7-day already seeded in 0001).
  ('streak_3',          '3-Day Streak',       'Practise on three session days in a row.',    null, 3),
  ('streak_14',         '14-Day Streak',      'Practise on fourteen session days in a row.', null, 14),
  ('streak_30',         '30-Day Streak',      'Practise on thirty session days in a row.',   null, 30),
  -- Breadth across skills.
  ('explorer_3',        'Explorer',           'Complete tests in three different skills.',   null, 3),
  ('all_rounder',       'All-Rounder',        'Complete tests in all six skills.',           null, 6),
  -- Lifetime volume.
  ('volume_10',         'Rising Star',        'Complete 10 tests in total.',                 null, 10),
  ('volume_50',         'Dedicated',          'Complete 50 tests in total.',                 null, 50),
  ('volume_100',        'Centurion',          'Complete 100 tests in total.',                null, 100)
on conflict (code) do nothing;
