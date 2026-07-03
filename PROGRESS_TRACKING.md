# Progress Tracking

Lexora helps students and the teacher see progress clearly. The goal is to make students see that regular practice leads to improvement.

## Student progress

**Activity**
- Total completed tasks, broken down by category: Practice, Homework, Tests, Extra Practice — not one blended count. Low-stakes practice volume should visibly count as effort, not just formal test results.
- Weekly activity
- Streak — scheduled-session-day based, per the definition in `STUDENT_EXPERIENCE.md`, not calendar days.

**Scores**
- Average score — shown **per skill**, not blended.
- Highest score — per skill.
- ~~Lowest score~~ — not shown as a standalone stat. A raw low-score number is just a shame metric with no action attached, which works against the platform's own goal of students feeling progress before judgment. Instead, weak performance surfaces through **weak areas** (below), always paired with a next action (recommended practice), never as a bare number.

**Progress by skill** — covers all six skill areas consistently: Grammar, Vocabulary, Reading, Listening, Writing, Speaking. (Grammar and Vocabulary are not special-cased over the others — all six get the same treatment: score trend, weak topics, mastery/accuracy where applicable.)

**Trends** — two distinct, clearly labeled time windows, since they can legitimately disagree and both need to make sense shown side by side:
- **Trend indicator** — short-term, per skill, based on the most recent attempt vs. the average of the previous 3–4 (same window as `PLATFORM_PURPOSE.md`'s "Am I improving?"). Used for quick, current-state feedback.
- **Monthly improvement** — this month's average per skill vs. last month's average per skill. Used for the longer-view chart, not the quick dashboard signal.

## Teacher progress view

- Individual student progress (same structure as above, viewed per student)
- Group progress — group average per skill
- Class average — per skill, not blended
- Skill weaknesses — group-level, skill + topic level (per `TEXTBOOK_SYSTEM.md` topic tagging)
- Test completion rate — measured against assigned Tests and Homework specifically; Extra Practice is excluded since it's optional and open-ended, with no meaningful "completion" denominator.
- Inactive students — same activity-window definition as `TEACHER_DASHBOARD.md`.
- Improvement over time — defined concretely as the group's **average score per skill, tracked in weekly/monthly buckets** — not an abstract composite score, so it stays explainable if a teacher asks why the platform says the group is improving.

## Visualization

Simple charts, cards, and clear numbers — specifically:
- A **radar/spider chart** for "progress by skill," showing all six skill areas at a glance. This is a deliberate choice: it reads relative strength/weakness faster than six separate bars, and it's a distinctive visual that supports the platform's goal of not looking like a generic template.
- Line charts for score trend over time, per skill.
- Simple bar/comparison for group-level views (class average per skill, top performers).
