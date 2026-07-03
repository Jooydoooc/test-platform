# Practice Types

Lexora supports different General English practice types across six skill areas. Each type listed here is a **content/question format**, usable in both untimed **Practice** (retakeable, doesn't affect rank) and timed **Test** (scored, feeds progress and ranking) contexts — the format is the same either way; what changes is timing and whether it counts toward results.

## Grading model

Practice types fall into two grading categories, and this determines how each one is built:

- **Auto-gradable** (instant, rule-based): Grammar, Vocabulary, Reading, Listening. These are scored immediately against a defined correct answer (or set of accepted answers).
- **AI-assisted** (Gemini-based scoring, evaluated against a rubric, not exact-match): Writing, Speaking. These are built independently inside Lexora — not linked to or embedded from Speak_Age — but follow the same general approach: AI generates a score plus feedback, which the teacher can review and override.

## Grammar Practice (auto-graded)

- Multiple choice
- Gap filling
- Sentence correction
- Sentence transformation
- Uzbek → English translation
- English → Uzbek translation
- Error correction

**Translation exercises** (Uzbek↔English) are flagged separately from the rest of this category: because multiple correct translations often exist, these use fuzzy/keyword matching rather than strict string matching, and low-confidence matches are queued for a quick teacher check rather than auto-marked wrong.

## Vocabulary Practice (auto-graded, mostly)

- Word meaning
- Synonym matching
- Collocation practice
- Gap filling
- Spelling
- Word formation
- **Example sentence writing** — auto-checked for correct/plausible use of the target word in context (keyword + basic pattern matching), not full grammar evaluation. This is distinct from Writing Practice's "sentence writing" below, which focuses on grammar accuracy, not vocabulary usage.

## Reading Practice (auto-graded)

- Short texts
- Textbook readings
- True / False
- Multiple choice
- Matching
- Gap filling
- Comprehension questions

## Listening Practice (auto-graded)

- Audio-based questions
- Multiple choice
- Gap filling
- Dictation
- Note completion

## Writing Practice (AI-assisted grading)

- Short paragraph writing
- **Sentence writing** — focused on grammar accuracy for a target structure, distinct from Vocabulary's example-sentence writing above, which focuses on word usage.
- Grammar-based writing
- Topic-based writing
- Teacher feedback — AI-generated score/feedback is shown to the student, with the teacher able to review, edit, or add their own comment on top. The AI score is a starting point, not a replacement for the teacher's judgment.

## Speaking Practice (AI-assisted grading)

- Speaking questions
- Recording answers
- Pronunciation tasks
- Short response practice
- Topic-based speaking

Built as its own module inside Lexora, separate from the existing Speak_Age platform. Recording, storage, and playback of student audio is a real infrastructure requirement here — worth scoping early in `CLAUDE_RULES.md` (storage limits, supported formats, retention policy) since audio data is heavier and more sensitive than text-based results.
