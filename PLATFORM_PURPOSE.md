# Platform Purpose

The main purpose of Lexora is to help students practise English regularly and see their progress clearly.

Lexora should make learning more organized, measurable, and motivating.

All progress, results, and recommendations are tracked **per skill area** (grammar, reading, listening, vocabulary), not as a single blended score. A student can be strong in reading and weak in listening at the same time, and Lexora should always be able to show that breakdown, not just an overall number.

## Questions Lexora answers for students

- **What should I practise today?**
  Lexora surfaces: (1) any task the teacher has assigned and not yet completed, and (2) if nothing is assigned, a suggestion pointing at the student's currently weakest tracked skill. This is a simple rule-based suggestion (lowest recent accuracy / least recently practised), not an adaptive AI recommendation engine. That's a deliberate v1 scope limit — a smarter recommendation system can be a future feature, not a v1 dependency.

- **What is my current result?**
  Shown per skill area and per completed test, not as one combined score.

- **Am I improving?**
  "Improving" is measured as a trend over a defined window — most recent result vs. the average of the previous 3–4 attempts in the same skill area. This needs a consistent, stated comparison window so the trend line always means the same thing rather than shifting definitions between features.

- **What are my weak areas?**
  The skill area(s) with the lowest recent average accuracy, shown per skill, not blended.

- **How do I compare with my classmates?**
  Ranking is scoped to the student's own group only (see `RANKING_AND_MOTIVATION.md` — a Beginner should never be ranked against IELTS Graduation-level students).

- **What should I do next?**
  A direct extension of "what should I practise today," pointing toward assigned work first, then weakest-skill practice.

## Questions Lexora answers for the teacher

- **Which students are active?**
  Based on login/activity within a defined recent window (e.g. last 7 days).

- **Which students are improving?**
  Same trend logic as the student-facing version, aggregated so the teacher can see it across a group at a glance.

- **Which students are falling behind?**
  "Falling behind" is a concrete, explainable flag, not a vibe — a combination of: inactivity beyond a set threshold, a declining score trend, and/or low task completion rate. The teacher should always be able to see *why* a student was flagged, not just that they were.

- **Which skills are weak in this group?**
  Average accuracy per skill area, aggregated across the group.

- **Which tests have students completed?**
  Simple completion tracking per student, per assigned task/test.

- **Which vocabulary sets need more practice?**
  This is tracked at the individual vocabulary item level (not just "set completed/not completed") — the average recall accuracy per word/item across the group, so the teacher can see exactly which items are weak, not just which sets were finished.

## What Lexora is not

Lexora should not only give tests. It should create a clear learning routine — a consistent loop of practise, measure, review, and return, rather than a series of disconnected quizzes.
