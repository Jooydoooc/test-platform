# Vocabulary System

Lexora has a vocabulary practice system built around individual vocabulary items, tracked at item-level granularity (per `PLATFORM_PURPOSE.md`'s "which vocabulary sets/items need more practice").

## Vocabulary Sets

The concrete, assignable/practiceable unit is a **Vocabulary Set** — e.g. "Solutions Elementary Unit 3 vocabulary," or a custom teacher-made list. Sets are created once and can be assigned to multiple groups, same reusability principle as textbook content and tests.

Sets can be organized/filtered by:
- Level
- Book
- Unit
- Topic (shared tag system with `TEXTBOOK_SYSTEM.md`)
- Lesson
- Teacher list (a custom set not tied to a specific book/unit)

## Vocabulary item fields

- Word
- Meaning (English definition)
- Translation (Uzbek — matching the student base and the Uzbek↔English translation tasks already in `PRACTICE_TYPES.md`)
- Synonym
- Example sentence
- Collocation
- Pronunciation — IPA transcription by default; audio is optional where available, not required for every item, to keep content creation fast across 5 curriculum levels
- Word form (related forms, e.g. economy / economic / economically — feeds the "word formation" practice type)

## Vocabulary practice types

- Choose the meaning
- Choose the synonym
- Fill in the gap
- Match word and definition
- Write a sentence — same mechanism as "example sentence writing" in `PRACTICE_TYPES.md` (auto-checked for correct usage of the target word, not full grammar evaluation); referenced here, not rebuilt separately.
- Spelling practice
- Collocation practice

## Vocabulary progress — state definitions

Each vocabulary item, per student, moves through a simple state based on recent practice accuracy (not a full spaced-repetition algorithm — kept simple and explainable for a teaching tool, not a dedicated SRS app):

- **New** — not yet practised.
- **Learning** — practised at least once, fewer than 3 correct attempts.
- **Reviewed / Learned** — 3+ correct attempts, without yet meeting the mastery threshold below.
- **Mastered** — 3 consecutive correct attempts across at least 2 separate practice sessions (not all in one sitting, so it reflects retention, not a lucky streak).
- **Weak** — any item where the most recent attempt was incorrect, or where accuracy over the last 5 attempts falls below 60% — regardless of past mastery. A previously mastered word can become weak again if the student starts getting it wrong.

**Review reminders** surface items that are due for another look: weak items first, then items in "Learning" that haven't been practised in a defined window (e.g. 5+ scheduled session days, matching the streak logic in `STUDENT_EXPERIENCE.md`).

This state feeds directly into the Vocabulary skill area's weak-areas signal in `PLATFORM_PURPOSE.md` and the group-level "which vocabulary needs more practice" view in `TEACHER_DASHBOARD.md`.
