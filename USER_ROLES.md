# User Roles

## Student

Students should be able to:
- log in to their account
- see their dashboard
- view assigned tasks
- practise textbook-based exercises
- complete vocabulary tasks
- take tests
- see their scores
- review mistakes
- track their progress
- see badges and ranks
- compare results with classmates
- access teacher-uploaded resources

**Ranking visibility:** On leaderboards, students see other students by first name + last initial only (e.g. "Aziz K."), never full names, and never any contact or account details. This applies within their own group only — students never see rankings, names, or results from other groups.

**Group changes:** A student can be moved from one group to another (e.g. progressing from Elementary to Pre-IELTS). When this happens, their full history — results, progress trends, badges — persists and simply continues under the new group. Moving groups never resets a student's data.

## Teacher / Admin

The teacher should be able to:
- create student accounts
- create groups
- assign tasks to groups
- upload resources
- create tests
- add vocabulary sets
- organize textbook units
- view student results
- track progress
- manage rankings
- give feedback
- control what students can access
- move a student between groups (preserving their history)

**Access control granularity:** Content access is group-level by default (assign a task/resource to a group, every student in it gets it), with the ability to override at the individual-student level (e.g. giving one advanced student in an Elementary group access to Pre-IELTS material). Individual overrides are additive — they grant extra access, they don't restrict a student below their group's baseline.

**v1 scope note:** Teacher and Admin are combined into a single role for now, since there is currently one teacher who is also the platform owner. This is a deliberate simplification, not a permanent architectural assumption — if a second instructor is ever added, this role should split into:
- **Admin**: platform-wide control (create any group, manage all teachers, full access control)
- **Teacher**: scoped to their own assigned groups only (assign tasks, grade, give feedback, view results — only for their students)

`CLAUDE_RULES.md` should note this so the data model doesn't hard-wire "teacher = admin" in a way that's difficult to split later (e.g. permissions should be checked against a role, not assumed from account existence).

## Guest

Lexora is a closed platform. Guest is **not an authenticated role** and has no database presence, no account, and no access to any student, teacher, or platform data.

The only unauthenticated surface is a public-facing login page containing:
- a short platform description
- contact information

No other route, page, or data should be reachable without logging in.
