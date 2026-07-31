-- ---------------------------------------------------------------------------
-- Server-side re-grading for hosted HTML tests.
--
-- Hosted tests grade themselves in the browser and POST the score, so before
-- this migration the server had no answer key and could not check the claim.
-- A student could open devtools and post a perfect score without answering:
--
--   fetch(LEXORA_TEST.submitUrl,{method:"POST", ...,
--     body:JSON.stringify({attemptId:LEXORA_TEST.attemptId,
--                          skills:[{skill:"GRAMMAR",correct:30,total:30}]})})
--
-- This table gives the server its own key. When a key exists for a test, the
-- submit route (src/app/api/tests/html/submit/route.ts) ignores the client's
-- claimed score entirely and re-grades the submitted ANSWERS itself.
--
-- HONEST LIMIT: the questions and their correct answers still ship inside the
-- self-contained HTML, so a student who reads the page source can look the
-- answers up. This closes score FORGERY (claiming a score you did not earn); it
-- does not make a hosted test unreadable. Assessments that must be tamper-proof
-- belong on the server-graded /t/<token> rail, where answer_key never leaves
-- the database (migrations 0018 + 0019).
--
-- Additive: new table only. No existing row is read, changed or dropped.
-- ---------------------------------------------------------------------------

create table if not exists html_test_answer_keys (
  html_test_id uuid primary key references html_tests (id) on delete cascade,
  -- Shape: { "version": 1, "count": <questions served per attempt>,
  --          "skill": <skill_area>,
  --          "items": { "<question id>": { "t": "mc"|"wo"|"tr",
  --                                        "a": [<accepted answer strings>] } } }
  --
  -- `count` is the denominator the server insists on. Without it a tampered
  -- client could submit a single correct answer and score 1/1 = 100 %.
  -- Answers are compared as TEXT, never as choice indexes: hosted tests shuffle
  -- their options per attempt, so an index would grade the wrong option.
  answer_key jsonb not null,
  -- Rollout switch. false = the key exists but a payload without answers is
  -- still accepted as a self-report (lets a key land before the updated test
  -- file is live). true = answers are mandatory, so omitting them cannot be
  -- used to dodge re-grading.
  require_answers boolean not null default false,
  created_at timestamptz not null default now()
);

alter table html_test_answer_keys enable row level security;

-- No policy is created, on purpose: with RLS enabled and zero policies the
-- table is invisible to anon/authenticated through PostgREST. Only the
-- service-role client (the submit route) can read it. Belt and braces:
revoke all on html_test_answer_keys from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Key for "Present Continuous — Beginner Test"
-- (storage_path .../present-continuous-beginner.html).
--
-- Generated directly from the BANK array in the test file, so the key cannot
-- drift from the questions through a transcription slip. Covers all 50 bank
-- items; each attempt draws 30 of them.
--
-- Matched on storage_path rather than a hardcoded uuid so the migration is
-- environment-independent: on a database where that test does not exist the
-- insert affects no rows and the feature stays dormant.
-- ---------------------------------------------------------------------------

insert into html_test_answer_keys (html_test_id, answer_key, require_answers)
select h.id, '{"version":1,"count":30,"skill":"GRAMMAR","items":{"31":{"t":"mc","a":["is dancing"]},"32":{"t":"mc","a":["am drinking"]},"33":{"t":"mc","a":["are doing"]},"34":{"t":"mc","a":["isn''t walking"]},"35":{"t":"mc","a":["aren''t eating"]},"36":{"t":"mc","a":["Is"]},"37":{"t":"mc","a":["are"]},"38":{"t":"mc","a":["singing"]},"39":{"t":"mc","a":["taking"]},"40":{"t":"mc","a":["sitting"]},"41":{"t":"mc","a":["staying"]},"42":{"t":"mc","a":["coming"]},"43":{"t":"mc","a":["writing"]},"44":{"t":"mc","a":["am not"]},"45":{"t":"mc","a":["Is"]},"46":{"t":"mc","a":["is"]},"47":{"t":"mc","a":["aren''t"]},"48":{"t":"mc","a":["isn''t going"]},"49":{"t":"mc","a":["Is the plane flying?"]},"50":{"t":"mc","a":["isn''t"]},"51":{"t":"wo","a":["My father is washing the car"]},"52":{"t":"wo","a":["The girls are dancing in the room"]},"53":{"t":"wo","a":["I am taking a photo"]},"54":{"t":"wo","a":["The sun is shining today"]},"55":{"t":"wo","a":["We are having breakfast now"]},"56":{"t":"wo","a":["The dog is not sleeping outside"]},"57":{"t":"wo","a":["They are not coming with us"]},"58":{"t":"wo","a":["Aziza is not using her computer"]},"59":{"t":"wo","a":["I am not writing a message"]},"60":{"t":"wo","a":["The boys are not swimming today"]},"61":{"t":"wo","a":["Is your mother cooking dinner"]},"62":{"t":"wo","a":["Are the students sitting quietly"]},"63":{"t":"wo","a":["Where are you going"]},"64":{"t":"wo","a":["What is Nodir carrying"]},"65":{"t":"wo","a":["Why are they running"]},"66":{"t":"tr","a":["dilnoza is dancing now"]},"67":{"t":"tr","a":["i am opening the window"]},"68":{"t":"tr","a":["the students are learning english","students are learning english"]},"69":{"t":"tr","a":["my father is driving now","my father is driving a car now"]},"70":{"t":"tr","a":["the cat is lying under the table","the cat is laying under the table"]},"71":{"t":"tr","a":["akmal is not reading a newspaper now","akmal is not reading newspaper now"]},"72":{"t":"tr","a":["we are not waiting for the teacher"]},"73":{"t":"tr","a":["my sister is not making a cake","my sister is not baking a cake"]},"74":{"t":"tr","a":["i am not sitting on the floor"]},"75":{"t":"tr","a":["the children are not playing outside","children are not playing outside"]},"76":{"t":"tr","a":["are you writing an email","are you writing an e-mail"]},"77":{"t":"tr","a":["is madina running in the park"]},"78":{"t":"tr","a":["what are the children eating","what are children eating"]},"79":{"t":"tr","a":["why is the teacher smiling"]},"80":{"t":"tr","a":["are we going home now"]}}}'::jsonb, true
from html_tests h
where h.storage_path like '%present-continuous-beginner.html'
on conflict (html_test_id) do update
  set answer_key      = excluded.answer_key,
      require_answers = excluded.require_answers;
