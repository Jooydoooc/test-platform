# Design

Visual system for Lexora. Product register: design serves the task. Restrained base, one confident indigo brand, teal and amber as meaning-bearing accents.

## Theme

Light, calm, focused. A cool near-white study surface (not cream, not flat white) with near-black slate ink and an indigo-violet brand. The mood is a quiet desk in good daylight: a student sitting down to practise, wanting clarity and momentum, not stimulation. Light mode is the default because sessions are short and daytime; a dark mode is a future addition, not the base.

Color strategy: **restrained** — tinted neutrals plus one saturated brand, with two accents reserved for specific meanings. Brand indigo carries identity and primary actions. Teal signals progress and success. Amber celebrates achievement (best scores, badges, teacher spotlight).

## Color

OKLCH intent noted; ship as the hex/Tailwind tokens already in `tailwind.config.ts`.

### Brand — indigo-violet (identity, actions, current selection)

| Token | Hex | Use |
|---|---|---|
| brand-50 | #f2f1fd | tint backgrounds, icon chips |
| brand-100 | #e7e4fb | hero sub-text on brand, soft fills |
| brand-200 | #d1ccf7 | selection, dividers on tint |
| brand-300 | #b1a6f0 | hover borders |
| brand-500 | #6f57db | focus ring base |
| brand-600 | #5a3fca | primary buttons, active nav, links |
| brand-700 | #4a33a6 | button hover, link text on tint |
| brand-800 | #3e2c86 | button active |
| brand-900 | #35276b | strongest ink accent |

### Accents (meaning-bearing, never decorative)

- **Teal** (progress, success, "you're on track") — Tailwind `teal-500/600/700` on `teal-50` fills. Use for completion, streaks, "correct", growth trends. This is the color of forward motion; the base ships without it, so introducing it is a deliberate signal.
- **Amber** (achievement, celebration) — `amber-500/600` on `amber-50`. Best scores, badges, top-of-leaderboard, teacher spotlight. Sparing by design.
- **Emerald / Rose** — pass/fail on results only, always paired with text or icon (never color alone).

### Neutrals

Slate ramp. Ink `slate-900` (#0f172a); body `slate-600`; muted `slate-500` (meet 4.5:1 — do not go lighter for body). Surfaces: body `#f6f7f9`, cards `#ffffff` with `border-slate-200/80`. Selection `#d1ccf7` on `#35276b`.

### Contrast rules

Body ≥4.5:1, large ≥3:1. On brand-600 surfaces use white or `brand-50/100`, never mid-gray. Pass/fail never conveyed by color alone.

## Typography

- **Family:** Inter (`next/font`, `--font-sans`), one family, weight contrast for hierarchy. Optional future display face for the wordmark only; do not add a third family without reason.
- **Numerics:** `tabular-nums` for all scores, percentages, counts, and leaderboard figures.
- **Scale:** h1 `text-3xl`→`sm:text-4xl` bold; section h2 `text-lg`/`text-2xl` semibold; body `text-sm`/base slate-600; labels `text-xs font-medium`. Keep ≥1.25 step contrast; avoid flat scales.
- **Wrapping:** `text-balance` on h1–h3, `text-pretty` on prose. Body line length ≤75ch.
- **Bans:** no all-caps body; uppercase only for short labels/badges. No tiny tracked-uppercase eyebrow above every section.

## Components

- **Button / LinkButton** (`components/ui.tsx`): `primary` = brand-600 fill; `secondary` = white + slate border; `ghost` = slate hover; `danger` = red outline. Radius `rounded-lg`, min 44px touch target on mobile, `transition-colors`.
- **Card:** `rounded-xl border-slate-200/80 bg-white shadow-card`. Hover elevation `shadow-card-hover` + `-translate-y-0.5` + brand border only on interactive cards. No nested cards. Cards are not the default container — use them when they're the right affordance.
- **Badge** (`tone`: brand/amber/success/neutral): `rounded-full` ring-inset tint chip for status.
- **ProgressBar** (`tone`: brand/success/amber): 2px track, animated width, `role="progressbar"` with aria values.
- **Inputs** (`inputClass`): `rounded-lg`, 16px text on mobile (prevents iOS zoom), brand focus ring.
- **Icons:** 20px line icons, 1.75 stroke, `currentColor`, `stroke-linecap/join round`. Consistent set — no emoji as primary UI icons in polished surfaces (legacy emoji headings should migrate to line icons).

## Layout

- Container `max-w-5xl`, `px-4`, generous vertical rhythm (`space-y-8/10`, `py-8 sm:py-10`).
- Responsive grids: `sm:grid-cols-2 lg:grid-cols-3`; prefer `flex-wrap` for 1D.
- Elevation: `shadow-card` resting, `shadow-card-hover` on lift. Soft, low, product-grade — never a drop-shadow slab.
- Semantic z-index scale for dropdown → sticky → modal → toast; no arbitrary 9999.

## Motion

- `transition-colors duration-150` on controls; card lift `duration-200`; progress fill `duration-500`.
- Ease-out only, no bounce/elastic. Hover affordances (arrow nudge, lift) are subtle.
- Honor `prefers-reduced-motion: reduce` (already globally reduced in `globals.css`).

## Focus & selection

Global focus-visible ring `2px #5a3fca` offset 2px on every interactive element. Selection `#d1ccf7` / `#35276b`.
