# Textbook System

Lexora allows students to practise with textbook-based materials, structured to mirror how the books are actually taught, and to help students continue practising after class.

## Structure

Book → Unit → **Lesson (optional)** → Topic → Tasks

- **Lesson** is optional, used only when a given textbook actually has that layer. Some books go straight from Unit to Topic.
- **Topic** (e.g. "Present Simple," "There is / There are") is a **reusable, cross-book tag** — the same topic tag can appear under different books and units. This enables topic-level weak-area tracking (e.g. "weak in Present Simple" specifically, not just "weak in grammar"), which is a sharper signal than skill-level tracking alone and should feed directly into the weak-areas logic in `PLATFORM_PURPOSE.md` and `TEACHER_DASHBOARD.md`.
- A Unit or session can draw tasks from **more than one book at once** — the platform should not assume one linear book per unit, since actual teaching (e.g. the Elementary level) already combines multiple books (grammar textbook + supplementary reading/listening resources) in parallel.

## Task types

Textbook Tasks are not a separate exercise system — they are instances of the content types already defined in `PRACTICE_TYPES.md` (gap filling, sentence correction, translation, multiple choice, etc.), tagged with book/unit/lesson/topic metadata. This keeps grading, auto-checking, and AI-assisted scoring consistent everywhere in the platform rather than duplicated per system.

## Task categories

- **Exercises** — core tasks tied to a specific lesson/topic, mirroring in-class material.
- **Homework** — exercises explicitly assigned by the teacher with a due context; these are what appear under a student's "today's assigned tasks."
- **Extra practice** — optional, self-directed, always available, not assigned by the teacher; this is what surfaces under "recommended practice" when a student has nothing currently assigned.

## Notes

**Teacher notes** are teacher-only by default (planning/context notes, not shown to students). If a task needs student-facing instructions, that's a separate, explicit field — the two should never be the same text box.

**Answer checking** follows the grading model defined in `PRACTICE_TYPES.md` — auto-graded for objective types, AI-assisted for writing, with translation tasks using fuzzy/keyword matching and a low-confidence review queue, per the same doc.

## Access

Students see only the units/topics a teacher has unlocked or assigned — not the entire book from day one. This matches how pacing is actually controlled across groups today, rather than letting students free-roam ahead of the class.

## Example

```
Book: Solutions Elementary
Unit: 3
Lesson: Grammar
Topic: Present Simple
Tasks:
- Exercise 1: gap filling
- Exercise 2: sentence correction
- Exercise 3: translation
- Extra task (extra practice): write 10 sentences

Book: Round Up 2
Unit: 5
Topic: There is / There are
Tasks:
- Grammar explanation (resource, not scored)
- Exercise 1: multiple choice
- Exercise 2: sentence writing
- Homework: short test
```
