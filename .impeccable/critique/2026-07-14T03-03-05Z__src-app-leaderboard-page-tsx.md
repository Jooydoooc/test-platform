---
target: the leaderboard
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-07-14T03-03-05Z
slug: src-app-leaderboard-page-tsx
---
# Critique — Leaderboard (`src/app/leaderboard/page.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Strong states, but two different "#N" numbers can show at once (all-time rank vs period podium) |
| 2 | Match System / Real World | 3 | 9-tier / 3-division ladder borrows esports convention; may be alien to non-gamer ESL students |
| 3 | User Control and Freedom | 3 | Read-only view; period + show-all toggles present, nothing to trap the user |
| 4 | Consistency and Standards | 3 | Violates own DESIGN.md: tracked-uppercase eyebrows + `slate-400` below stated contrast floor |
| 5 | Error Prevention | 3 | Little to get wrong; failed state handled |
| 6 | Recognition Rather Than Recall | 3 | Badges icon-only, meaning hidden behind `title` tooltips (no touch, low discoverability) |
| 7 | Flexibility and Efficiency | 3 | Period toggle + show-all; fine for a glanceable board |
| 8 | Aesthetic and Minimalist Design | 2 | 27 rank-steps of machinery for a class of ~5-30; ladder mostly renders empty "0" tiers |
| 9 | Error Recovery | 3 | Failed state says "try again" but offers no retry button |
| 10 | Help and Documentation | 3 | "Rank journey" explainer + slogans + privacy note are genuinely helpful inline |
| **Total** | | **30/40** | **Good** |

## Anti-Patterns Verdict

Does it look AI-generated? No — the opposite risk. Tier medallions use real hand-cut shield SVGs (feSpecularLighting bevels, brushed-metal grain, gemstone refraction). Failure mode is over-engineering relative to audience, not slop.

Deterministic scan: detect.mjs returned [] — zero slop hits.

The one AI-grammar tell not caught by detector: three section labels (Top 3, Standings, Rank journey) use `text-xs font-semibold uppercase tracking-wide text-slate-400` — the tracked-uppercase eyebrow the project's own DESIGN.md bans. Self-inconsistency.

Visual overlays: not available this run (no live browser inspection; dev server off).

## Overall Impression

Confident, well-built board — complete states, thoughtful privacy model (top-5 public + always-see-yourself with the gap row), rank pinned to all-time XP so period toggle never demotes. Biggest opportunity: right-size the gamification to the actual population. A 9-tier x 3-division ladder (27 steps, thresholds to 5,000+ XP) is Riot-scale on one teacher's classroom, where most students cluster in Iron/Bronze and the ladder mostly shows 0 counts.

## What's Working

1. State coverage complete and honest — loading, failed, empty-group, in-standings gap-row all handled with real copy.
2. "Your Progress" card nails "progress is the product": rank, slogan, progress bar, XP-to-next-division, XP-to-pass-the-person-above, streak in one glance.
3. Rank pinned to all-time XP (tierFor(me.xpTotal)) so switching to "This week" never demotes a student's tier.

## Priority Issues

[P1] slate-400 used for meaningful text, below own contrast floor
- Podium XP figure (line 426), "Tier · N activities" subtitle (line 448), section labels all slate-400 (#94a3b8 ~3.3:1 on white). PRODUCT.md targets WCAG AA; DESIGN.md says muted slate-500 minimum. Podium XP — the differentiating number — is the faintest thing on the card.
- Fix: bump meaningful muted text to slate-500; podium XP to slate-600; keep slate-400 only for decorative marks.
- Command: /impeccable audit (contrast) or fold into /impeccable polish.

[P1] Tier machinery scaled for thousands, deployed for dozens
- 9 tiers x 3 divisions + full descending ladder; most tiers show count:0 in a real class. Aesthetic/minimalist hit.
- Fix: collapse ladder to viewer tier +/-1 with expander; or compress to ~5 tiers with tighter thresholds; or hide empty tiers. Keep the medallions, right-size the frame.
- Command: /impeccable distill.

[P2] Two different "#N" on screen at once
- Progress card "#3 all-time" vs period podium "#1 this week"; neither labelled by which ranking. First-timer reads a contradiction.
- Fix: label period sections ("This week's movers") and annotate Progress card "#3 all-time".
- Command: /impeccable clarify.

[P2] Badge meaning hidden behind title tooltips
- RankRow badges icon-only with title=; tooltips don't fire on touch. Mobile is primary device per PRODUCT.md.
- Fix: text labels on own row; tap/press-reveal or legend for others.
- Command: /impeccable clarify or /impeccable adapt.

## Persona Red Flags

Sam (Accessibility): slate-400 XP/labels fail 4.5:1. Badge meaning only in title (not announced). Failed-state has no keyboard-reachable retry.
Casey (Mobile): podium overflow-x-auto at min-w-[104px] tight on 320px. Badge tooltips absent on touch.
Jordan (First-timer ESL): Iron/Bronze/Challenger + III->II->I is esports literacy; dual "#N" reads as a bug.

## Minor Observations

- Failed state (line 623) has no retry button — requires manual reload.
- getBadges recomputes maxWeek per RankRow (O(n^2)); trivial at class size.
- key={p.name + i} uses display name; prefer student_id (available on row).

## Questions to Consider

- If a full term can't move a typical student past Silver, are 9 tiers motivating or discouraging?
- Podium re-sorts by period but rank is all-time. Which number does a student care about? Pick the hero.
- Could the medallions carry more load and the tracked-uppercase labels less?
