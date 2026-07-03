# Test and Results

Lexora supports teacher-created tests, built from the same content/question types defined in `PRACTICE_TYPES.md` — tests are not a separate authoring system, just a timed, scored context for the same task types.

## Test classification

Two independent dimensions, not one flat category list:

**Skill Scope** — grammar / vocabulary / reading / listening / mixed
**Test Purpose** — unit test / monthly test / placement test / custom

A test is always one of each (e.g. "mixed, monthly" or "grammar, unit").

### Placement tests — a special case

Placement tests do not require a level or group (their purpose is determining one for a student who doesn't have it yet). Placement results are **excluded** from ranking, streaks, and progress trends — they're diagnostic, not performance, and including them would distort a new student's early trend data.

## Test fields

- Title
- Level
- Group (not required for placement tests)
- Time limit (whole-test timer with auto-submit, matching the format used in prior IELTS test tools)
- Instructions
- Questions (drawn from `PRACTICE_TYPES.md` content types)
- Answer key — for auto-gradable question types, an exact/accepted-answer key; for Writing/Speaking questions included in a test, this is a **scoring rubric** instead, feeding the AI-assisted grading defined in `PRACTICE_TYPES.md`
- Score — shown **per skill area** for mixed tests, not one blended number
- Result page

## Retake policy

Tests are **single-attempt by default**. A teacher can explicitly re-open a test for a specific student (e.g. a technical issue during the attempt) — retakes are a deliberate teacher action, not a student-initiated option, to keep ranking and progress data meaningful.

## Result page

Shows:
- Score (per skill, for mixed tests)
- Percentage
- Correct answers
- Incorrect answers
- Time spent
- Mistakes — each linked back to its **Topic tag** (from `TEXTBOOK_SYSTEM.md`), not just its skill area, so weak-area tracking stays topic-level, not just skill-level
- Weak areas (skill + topic level)
- Teacher feedback, if available

**Pending review state:** if a test includes Writing or Speaking questions, the result page shows final scores for auto-graded sections immediately, with AI-assisted sections marked "pending review" until scoring completes — the page never presents an incomplete score as if it were final.

The result page should be clear and useful, not just a number — every mistake should point somewhere actionable (a topic to revisit, a skill to practise), not just mark an answer wrong.
