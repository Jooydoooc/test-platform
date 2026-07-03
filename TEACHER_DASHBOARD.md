# Teacher Dashboard

The teacher dashboard should be practical and organized, built to work at real scale — multiple groups, many students per group — not just for a single class.

## On login — surfaced proactively, not buried

These appear immediately, not only if the teacher goes looking for them:
- **Students who need attention** — uses the exact same "falling behind" definition as `PLATFORM_PURPOSE.md` (inactivity + declining trend + low completion, combined and explainable), never a separate rule.
- **Weak areas by group** — per skill area, not blended, consistent with per-skill tracking everywhere else in the platform.

## Overview

- Total students (with a per-group breakdown, not just a platform-wide count)
- Active / inactive students (per group and overall)
- Groups
- Assigned tasks
- Completed tests
- Average group score — shown **per skill area**, not as one blended number
- Top students (per group — a Beginner group and an IELTS Graduation group should never be compared against each other)
- Recent submissions — recently completed auto-graded tasks/tests (grammar, reading, listening, vocabulary). Not a manual-grading queue, since writing/speaking review isn't in v1 scope.

## Teacher actions

- Create a group
- Add students (including **bulk import**, e.g. from a roster file — with 7+ groups and 15 students each, one-by-one entry doesn't scale)
- Assign tasks **to one or multiple groups at once**
- Create textbook practice
- Create vocabulary tests
- Create grammar tests
- Upload resources
- View student history
- Check individual progress (per skill, trend over time — matching the student-facing view)
- Export results (to `.xlsx`/CSV by default, matching how results are already tracked outside the platform)
- Give feedback (short comment attached to a specific result — same scope as defined in `STUDENT_EXPERIENCE.md`)

## Content reusability

Textbook practice, vocabulary sets, and grammar/test content are created **once** and can be assigned to any number of groups — they are not duplicated per group. This is the main lever on the platform's core promise of saving the teacher time: content built for one Elementary group should be assignable to every Elementary group without rebuilding it.

The dashboard should help the teacher save time and control the whole learning process — for one group and for all of them at once.
