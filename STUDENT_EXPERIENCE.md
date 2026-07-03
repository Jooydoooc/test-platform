# Student Experience

The student dashboard should feel simple, motivating, and clear.

To avoid the dashboard becoming crowded, its elements are organized in **tiers**, not as one flat list. Only the top tier is prominent on first load; everything else is one tap/scroll away.

## Tier 1 — immediately visible, front and center

- **Today's assigned tasks** — what the student needs to do right now.
- **Latest result** — how their most recent test/task went.
- **Recommended practice** — one clear next action if nothing is assigned. This follows the same rule-based logic defined in `PLATFORM_PURPOSE.md`: assigned work first, then a pointer at the student's currently weakest skill. It is not an adaptive AI recommendation.

## Tier 2 — one tap away (a "progress" or "stats" view)

- Progress level (current curriculum level / standing)
- Weak areas (per skill, per `PLATFORM_PURPOSE.md`'s per-skill tracking)
- Active streak
- Badges

## Tier 3 — one tap away (a "compare" or "class" view)

- Current rank
- Group leaderboard (first name + last initial only, own group only — per `USER_ROLES.md`)
- Recent teacher feedback

## Definitions worth locking down

**Active streak** is measured against **scheduled session days**, not calendar days. Since lessons run on an odd/even schedule (not daily), a streak counts consecutive *scheduled* days on which the student completed their assigned work — a day with no scheduled session never breaks it. A daily-app-style calendar streak would unfairly break for students doing everything right, which works against the platform's motivation goal.

**Recent teacher feedback**, for v1, means short comments a teacher attaches directly to a specific test or task result — not full essay/writing feedback. If writing/speaking submissions and detailed feedback are added later, this section extends naturally; it is not currently meant to replace or represent that.

## What students should understand at a glance

1. What they need to do
2. How well they are doing
3. What they need to improve
4. How they compare with others

The platform should make students feel that their effort is visible — which is also why Tier 1 leads with *action* and *recent result*, not with comparison or ranking. Students should feel progress before they feel judged against classmates.
