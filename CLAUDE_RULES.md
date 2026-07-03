# Claude Rules

This file is the final checkpoint before any code is written. It consolidates the cross-cutting technical rules that were established while drafting the other documents — read this alongside all other `.md` files in this folder, not instead of them.

## Before coding

- Read all `.md` files in this folder carefully.
- Lexora is **private** — a closed platform for one teacher's own students, not a public product.
- The main focus is **General English**, not IELTS. This is a genuine scope shift from this teacher's other tools (Speak_Age, Band Zero, the reading platform) — Lexora is not an IELTS site and should never drift toward looking like one.
- Do not design it as a basic quiz app, a public course website, or a generic AI-generated template.

## Tech stack

Same stack as the existing Speak_Age platform, for consistency and to reuse known-working infrastructure:
- **Backend**: Node.js / Express
- **Database**: PostgreSQL via Neon
- **Auth**: JWT + Google OAuth
- **Deployment**: Vercel

## Core data model (canonical entities)

These are the entities every other document assumes exist. Keep field names and relationships consistent with this list across the whole codebase:

- **User** (role: Student or Teacher/Admin — merged as one role for v1; see Roles below)
- **Group** (tied to a curriculum level: Beginner, Elementary, Pre-IELTS, IELTS Introduction, IELTS Graduation)
- **Textbook** → **Unit** → **Lesson** (optional) → **Topic** (a reusable, cross-book tag — shared by textbook content and vocabulary)
- **Task** — a content item of one of four categories: **Practice** (untimed, retakeable, doesn't affect rank), **Homework** (assigned, has due context), **Test** (timed, scored, single-attempt by default, counts toward rank), **Extra Practice** (optional, self-directed, always available)
- **VocabularySet** → **VocabularyItem** (with per-student-per-item state: New / Learning / Reviewed-Learned / Mastered / Weak)
- **Attempt/Result** — one per task completion, scored **per skill area** (Grammar, Vocabulary, Reading, Listening, Writing, Speaking — all six treated consistently, never just the first four)
- **Badge**, **Points**, **Streak** — all driven by config values (see below), not hardcoded logic

## Roles

- Teacher and Admin are merged into one role for v1 (single teacher, who is also the platform owner). Permission checks must be written against a **role**, not assumed from account existence — this keeps the door open to splitting Teacher and Admin into separate roles later without a rewrite.
- Guest is not an authenticated role and has no database presence — only an unauthenticated login/description page exists.

## Config values — never hardcode these

The following must be adjustable config values, not baked into logic, since they'll need real-world tuning after launch:
- Vocabulary mastery/weak thresholds (currently: 3 consecutive correct across 2+ sessions = Mastered; <60% over last 5 attempts = Weak)
- "Falling behind" flag thresholds (inactivity window + score trend + completion rate)
- Streak windows and inactivity windows (scheduled-session-day based, not calendar-day based)
- Point values per action, and repeat-action point-farming limits
- Leaderboard public-visibility cutoff (currently: top 5)

## AI-assisted grading (Writing, Speaking)

- Built independently inside Lexora (not linked to or embedded from Speak_Age), using the same general approach: AI generates a score plus feedback; the teacher can review, edit, or override it.
- Requires **rate limiting and a cost ceiling** on Gemini API calls — with a growing student base making writing/speaking submissions, uncapped per-submission API calls could become an unbounded cost. Batch or throttle where reasonable.
- Speaking requires real audio infrastructure: recording, storage, playback. Define supported formats, storage limits, and a retention policy explicitly before building — audio data is heavier and more sensitive than text results.
- The platform never markets or narrates its own AI use in UI copy (see `NO_AI_STYLE.md`) — internally it's AI-graded, but the interface just says "Feedback."

## Secrets and environment variables

All credentials — database connection strings, JWT secret, Google OAuth credentials, Gemini API key, and (if a Telegram integration is ever added) `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — are set via environment variables. Never hardcode any credential in HTML, JS, or committed source.

## Platform rules

- Students have personal dashboards, tiered by priority (see `STUDENT_EXPERIENCE.md`) — not a flat list of ten equal-weight widgets.
- Teachers control tasks and tests, and can create content **once and assign it to multiple groups** — content is never duplicated per group. This includes bulk actions: student import, and multi-group task/test assignment. At 7+ groups and 100+ students, one-at-a-time actions don't scale.
- Students see results and progress broken down **per skill**, never as one blended score.
- Rankings motivate, never embarrass: group-scoped only, first-name-plus-last-initial only, top 5 shown publicly, full rank always visible privately to the student themself.
- Textbook practice is organized by Book → Unit → Lesson (optional) → Topic, with Topic as a reusable tag across books.
- Vocabulary practice is repeatable, trackable at the individual item level, and drives the mastery/weak state machine defined in `VOCABULARY_SYSTEM.md`.
- Results always show weak areas (skill **and** topic level) alongside scores — never a bare number with no next action.

## Design rules

- Keep the interface clean; dashboards easy to scan; test pages distraction-free; practice pages simple.
- Consistent spacing throughout.
- Avoid unnecessary animation, childish elements, and AI-generated-template looks (gradients, glow effects, generic hero sections).
- Use a radar/spider chart for the six-skill progress breakdown (see `PROGRESS_TRACKING.md`) — it's a more distinctive and more readable choice than six separate bars.
- No emoji in system-generated text (see `NO_AI_STYLE.md`).

## Quality standard

Lexora should feel like a private English learning system for serious students — not a public course website, a basic quiz app, or an AI-generated template. Every feature should trace back to a question this platform is meant to answer, as defined in `PLATFORM_PURPOSE.md`. If a feature doesn't answer one of those questions, it doesn't belong in v1.
