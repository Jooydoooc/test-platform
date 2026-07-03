# Design Style

Lexora should look like a private, modern learning platform — clean, professional, focused, motivating, modern, student-friendly, premium but simple. Serious enough for older teenage/adult students, friendly enough to stay motivating.

## Why these specific choices

A common pattern in AI-assisted design right now is warm cream backgrounds with serif headings and a terracotta accent. The direction below is close in spirit (warm, light, premium) but deliberately different in execution — true near-white rather than cream, a geometric sans rather than serif, and a gold/yellow accent from a distinct hue family — so it reads as a considered choice, not a template default.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| Background | `#FAFAF8` | Primary background — near-white, neutral, not cream |
| Text | `#1B2130` | Dark navy-black, primary text |
| Accent | `#E3A82B` | Warm gold/yellow — primary accent, used deliberately, not everywhere |
| Border | `#E3E1DB` | Soft warm grey — card borders, dividers |
| Success | `#3F8F5F` | Correct answers, positive trends — muted, not neon |
| Error | `#C1473A` | Incorrect answers — muted brick red, calm rather than alarm-toned. This matters: the platform's "don't embarrass weak students" principle extends to color, not just leaderboard visibility. Wrong answers should read as informational, not punitive. |
| Info | `#3E6FA0` | Progress bars, informational states |

## Typography

- **Display / headings**: Sora — a confident geometric sans, used with restraint (headings, key numbers), not a serif. Deliberately avoids the serif-on-warm-background look.
- **Body / UI text**: Inter or IBM Plex Sans — plain, highly readable, does the actual work of the interface.
- **Data / scores**: tabular numerals, ideally via a distinct monospace (IBM Plex Mono) for scores and percentages specifically. Numbers are everywhere in this platform (scores, percentages, ranks) — giving them a distinct, precise typographic treatment reinforces the "graded seriously" feel and doubles as a quiet signature detail.

## Signature element

The **radar/spider chart** for the six-skill breakdown (Grammar, Vocabulary, Reading, Listening, Writing, Speaking — see `PROGRESS_TRACKING.md`) is the one deliberately memorable visual element. Everything else stays quiet and disciplined around it — this is the single place the design is allowed to be bold.

## Layout concept — student dashboard (tiered, per `STUDENT_EXPERIENCE.md`)

```
┌─────────────────────────────────────┐
│  Tier 1 — always visible             │
│  [Today's tasks] [Latest result]     │
│  [Recommended practice]              │
├─────────────────────────────────────┤
│  Tier 2 — one tap away               │
│  Progress · Weak areas · Streak ·    │
│  Badges                              │
├─────────────────────────────────────┤
│  Tier 3 — one tap away               │
│  Rank · Leaderboard · Feedback       │
└─────────────────────────────────────┘
```

## Leaderboard pattern

- Top 5 shown as ranked rows/cards.
- The current student's own row is always visible and visually highlighted — pinned at the bottom of the view if they're outside the top 5. They always know exactly where they stand without the full class ranking being exposed (per `RANKING_AND_MOTIVATION.md`).

## Design rules

- Clean dashboard cards, clear progress bars, simple charts, readable typography, generous spacing.
- Tasks are easy to find; results are easy to understand at a glance.
- Icons: a single, consistent line-icon set (one stroke weight, no filled cartoon/3D icons) — supports "avoid childish icons" concretely rather than as a vague instruction.
- Avoid random gradients, heavy animation, and fake futuristic design.
- Animation, where used at all, is a single deliberate moment (e.g. a subtle transition when a result loads) — not scattered micro-effects, which read as templated rather than intentional.

## Quality floor (non-negotiable, not polish)

- **Light mode only for v1** — no dark mode required; stated explicitly so it isn't half-built by accident.
- **Responsive down to mobile** — students will use this on phones between classes.
- **Visible keyboard focus states** on every interactive element.
- **WCAG-reasonable contrast** — the chosen palette (dark navy on near-white) already supports this; don't lighten text below a legible contrast ratio for the sake of "softness."
- **Reduced motion respected** — honor `prefers-reduced-motion` for any animation used.

The platform should feel serious enough for older students, friendly enough to motivate them — and, above all, like it was built with intention, not assembled from defaults.
