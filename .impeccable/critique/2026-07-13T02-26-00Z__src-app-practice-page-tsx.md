---
target: Practice page
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-07-13T02-26-00Z
slug: src-app-practice-page-tsx
---
# Critique — Practice page (src/app/practice/page.tsx)

## Design Health Score: 28/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active states, aria-current, live completion %. No skeleton (stores sync) |
| 2 | Match System / Real World | 3 | XP + rank shown on a page that says "nothing is graded" |
| 3 | User Control and Freedom | 3 | Drawer closes, filters reset, native search |
| 4 | Consistency and Standards | 2 | Emoji vs line icons; rounded-3xl vs documented rounded-xl; bypasses <Card> |
| 5 | Error Prevention | 3 | Little to get wrong; n/a |
| 6 | Recognition Rather Than Recall | 3 | Everything visible and labeled |
| 7 | Flexibility and Efficiency | 3 | Search helps; no shortcuts (browse surface) |
| 8 | Aesthetic and Minimalist Design | 2 | Six card zones + 5-up emoji stats; no focal point |
| 9 | Error Recovery | 3 | Good scoped empty states |
| 10 | Help and Documentation | 3 | Inline teaching copy |

## Anti-Patterns Verdict
detect.mjs on the page: [] (exit 0), no regex slop. LLM: emoji stat row + everything-is-a-card are the two tells. Otherwise careful/human (a11y, teaching empty states, tabular-nums). No browser overlay — dev server was down.

## What's Working
- Strong accessibility (aria-pressed, aria-current, focus-visible, motion-reduce, 44px, labeled dialog).
- Empty states teach the gesture instead of shrugging.
- Honest warm microcopy ("nothing here is graded").

## Priority Issues
- [P1] Stats row (Total XP, Current rank) contradicts the header's "not graded / not on leaderboard" promise. Fix: reframe as all-time, or drop rank/XP and show practice momentum (streak, questions, accuracy). -> /impeccable clarify
- [P1] Emoji as primary UI icons violates DESIGN.md ("no emoji as primary UI icons") and the childish-quiz anti-reference. Rest of file uses lucide. Fix: swap to lucide (Flame/Star/Trophy/Target/BookOpen). -> /impeccable typeset
- [P2] Radius/card drift: hand-rolled rounded-3xl cards, never imports the <Card> primitive (system = rounded-xl). Fix: standardize radius, reuse <Card>, or update DESIGN.md and roll everywhere. -> /impeccable polish
- [P2] Everything is a card; primary CTA (Start practice) buried three sections down. Fix: demote stats to a strip, flatten one zone, let the CTA be the focal action. -> /impeccable layout
- [P2] Amber (text-accent-400) used decoratively on book-cover initials; amber is reserved for achievement. Fix: use white/brand tint. -> /impeccable colorize

## Persona Red Flags
- Casey (mobile): primary action buried below stats/vocab/levels/picker; no fast "resume last practice". State persists (good).
- Jordan (first-timer): greeted by five zeros/dashes before doing anything; needs an encouraging first-run state.
- Sam (a11y): strong, no blockers; emoji are aria-hidden with real text labels.

## Minor Observations
- Uppercase tracked section labels sit at the eyebrow line; fine as headers, watch for proliferation.
- h1 flips to "Welcome back, {name}" — greeting duplicates Dashboard; keep as "Practice".
- No skeleton state; fine only if stores stay synchronous.

## Questions to Consider
- Right momentum metric here if practice doesn't count?
- Do we need five level cards AND a book sidebar?
- What if only one thing on this page were a card?
