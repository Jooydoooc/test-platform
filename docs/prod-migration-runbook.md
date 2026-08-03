# Production migration runbook

**Status: nothing in this runbook has been applied to production.**

Scope: bringing production to the state PR #12 expects, and deploying the app.

This document contains no credentials, tokens, project refs, or connection strings. Every
value the operator needs is read at run time from the Supabase dashboard or existing
environment configuration, and must never be pasted into this file or into a commit.

Audience: whoever owns the production project. Steps requiring auth must be run by them.

---

## 1. Recorded migration history vs actual schema state

**These are not the same thing, and on this project they disagree.** Read this section
before acting on anything else; every plan below depends on the distinction.

`supabase migration list --linked` reports what is recorded in
`supabase_migrations.schema_migrations`. It does **not** inspect the schema. Objects
created out-of-band — via the dashboard SQL editor, or a direct psql session — are live
without ever being recorded.

Verified against production on **2026-08-01** (read-only queries; no writes):

| Migration | Recorded as applied | Actually live | Evidence |
|---|---|---|---|
| `0001`–`0019`, `0021`–`0023` | yes | assumed yes | migration list |
| `0024` integrity flags | **yes** | yes | migration list |
| `0025` link-gated tests | **no** | **YES** | `tests_select` is the restrictive `is_teacher() OR EXISTS(attempt for auth.uid())` form; `resolve_share_test`, `share_test_questions`, `start_share_attempt` all return `42501`, not `404` |
| `0026` attempt insert via RPC | **no** | **YES** | `start_share_html_attempt` returns `42501`, not `404` |
| `0027` html answer keys | **no** | **YES** | `html_test_answer_keys` exists; `SELECT` false for both `authenticated` and `anon` |
| `0028` revoke attempt insert | no | **no** | `has_table_privilege('authenticated','public.attempts','INSERT')` = **true** |
| `0029` bank30 answer key | no | not verified | — |
| `0030` explicit grants | no | **no** | `attempts` UPDATE still granted to `authenticated`; `anon` still holds DML |
| `0031` publish gate | no | **no** | `set_test_published` / `set_html_test_published` return `PGRST202` (absent), confirmed by the deploy preflight |

So **`0025`, `0026` and `0027` are already in effect but unrecorded.** Something applied
them outside the migration workflow.

> **Do not "fix" this with `supabase migration repair` yet.** Repair only rewrites the
> history table. Marking `0025`–`0027` as applied is correct only if they are applied *in
> full* — and only the effects listed above were verified, not every statement in those
> files. Reconciling history is a deliberate decision to be taken on its own, with the
> files re-read line by line. It is out of scope here.

### Production is not currently broken

A reasonable fear, given `0025`'s restrictive policy is live while unrecorded: that share
links stopped resolving. They did not.

`attempts` shows **3 attempts started on 2026-07-30 and 2 on 2026-07-29, with
submissions**. Under the live policy a student holding no attempt cannot read a `tests` row
directly, so the deployed build must already be calling the token RPCs. Vercel records every
recent production deploy as `gitDirty: "1"` — built from a working tree — so the running
build contains branch code predating the merge and **cannot be reconstructed from any
commit**.

> Establish this from attempt counts, as above. **Never** verify it by opening or starting a
> test with a real student account: attempts are one-per-student-per-test forever, so that
> permanently consumes a real student's only attempt and writes data that cannot be removed
> under the no-student-data-deletion rule.

---

## 2. What is actually outstanding

Nine migrations remain. Two are subtractive against the running app, and one has an
ordering constraint of its own.

| Migration | Effect | Risk against the running app |
|---|---|---|
| `0028` | `revoke insert on attempts from authenticated` | **the one to be careful with** — §4 |
| `0029` | answer-key content: upserts `html_test_answer_keys` for the bank30 test | none against the running app, but **can overwrite an existing answer key row** — see §4 and §8, and capture the prior row first |
| `0030` | enumerated per-table grants; `anon` gets nothing | none functionally, but **expected to abort** — §3 |
| `0031` | publish gate: tests start unpublished and must be published by an admin | none for existing tests, but **the ordering matters** — §5 |
| `0032` | adds `share_attempt_state`, a read-only, `authenticated`-only sibling of `start_share_attempt` used during the `/t/<token>` render to check submission state before questions are fetched | none for existing tests or attempts — additive and read-only. The preflight (§6) now requires it; deploying app code that calls it against a database without it breaks every share-link render with "Could not open this test." |
| `0033` | `create or replace function share_test_questions(p_token text)` — adds a submitted-attempt check: a student holding a submitted attempt gets zero rows back, teachers untouched | none for existing tests or attempts — additive, redefines a function body only. **But do not skip it**: the app-level gate added in `/t/[token]` (checks `share_attempt_state` from `0032` before rendering questions) only covers normal page navigation. `share_test_questions` is itself a public RPC, callable directly over PostgREST by any authenticated session holding the share token — without `0033`, a student who already completed a test can call it straight from the browser with their own JWT and the token, and get the full question bank back. `0033` closes that path at the RPC itself. |
| `0034` | `revoke update, delete on attempts` and `revoke insert, update, delete on attempt_answers`, from `authenticated` and `anon` | **subtractive, and it is what makes `0033` hold.** Verified live: `has_table_privilege('authenticated','public.attempts','UPDATE')` is `true` today, and `attempts_update` (`0002_rls.sql:182-183`) is row-scoped but not column-scoped. So a student can `PATCH /rest/v1/attempts?id=eq.<their own>` with `{"submitted_at": null}` and reopen a finished attempt — which defeats `0033` entirely, since that gate keys on `submitted_at is not null`. The same grant lets them re-point `test_id` at another test to satisfy the "an attempt row proves the link" check in `0025`. No app code writes these columns through the session client (every writer is the service-role admin client or a SECURITY DEFINER RPC), so the revoke is not expected to break any path. This is also the only change anywhere in the repo that revokes `attempts` UPDATE — see §3, where `0030` asserts on exactly that. |
| `0035` | schema hardening: locks the RLS helper functions (`is_teacher`, `owns_group`, `teaches_student`, `in_group`) behind explicit grants, rewrites `books_write` to enforce real ownership, redefines `group_xp_leaderboard()`, and pins `attempt_answers.question_id` to `ON DELETE RESTRICT` | additive/corrective; no data written. Its assertion block includes `anon holds DML on a public table` — the same invariant `0030` trips on (§3), so **`0035` is expected to abort for the same reason until anon DML is dealt with**. The FK it changes was `NO ACTION` (`confdeltype = 'a'`), not `CASCADE` — see
`supabase/migrations/0035_schema_hardening.sql:76`. L131–136 is the migration's *alteration*
guard (only fires, and only alters the constraint, if `confdeltype = 'a'` today); the
verification block's *rejection* assertion — which refuses to leave the migration applied
against either `CASCADE` (`c`) or `NO ACTION` (`a`) — is separate, at L378–382. `NO ACTION`
already causes today's app-layer pre-check (`src/lib/data/publish-test.ts`) to be backed by a
real refusal at the database level if that check is ever bypassed; `RESTRICT` makes that
guarantee explicit and immune to a future `DEFERRABLE` change, but no live path was ever
silently destroying data — the migration's own comment (L86-99) is explicit that `CASCADE` was
never the prior state, only the option it deliberately avoided. |
| `0036` | adds `finalize_html_test_attempt`, a SECURITY DEFINER RPC that stamps the attempt, writes `results` and `result_skill_scores`, and returns `was_already_submitted` in one transaction | additive — new function only. Makes hosted-test finalization atomic; today it is a multi-step non-atomic write that can leave an attempt stamped with no result row. The app code that calls it ships in the same PR, so **deploy and migration must move together** in both directions. The preflight (§6) now requires it (`scripts/preflight-deploy.mjs`, `finalize_html_test_attempt` entry, migration `0036`) — deploying app code that calls it against a database without it is blocked, the same way `0032`'s entry blocks a `share_attempt_state`-less deploy. |

### `db push` cannot be used for this set

`npx supabase db push` applies pending migration files in **numeric filename order**. The
dependency order this runbook needs does not match that order — most importantly, `0034`
must be live before `0030` can pass (below), but `0034` is numbered after `0030`, so a plain
`db push` runs `0030` first and it aborts before `0034` is ever reached. There is no flag that
reorders this.

**Apply the still-outstanding files individually, via the dashboard SQL editor, in the
dependency order below** — the same way §4 and §5 already single out `0028` and `0031` rather
than pushing the whole set. Do not run `db push` against production for this batch.

**Applying a file by hand through the SQL editor does not record migration history.** Only
`db push` (or `migration repair`) writes to `supabase_migrations.schema_migrations`. So for
every migration in this batch, `npx supabase migration list --linked` will **not** confirm it
applied — recorded and actual state already disagree for `0025`–`0027` for exactly this reason
(§1), and hand-applying `0028`–`0036` the same way reproduces the same gap for each of them.
After hand-applying any file here, verify it the way §1 already insists on: inspect the actual
function body, grant, or constraint state directly (e.g. `pg_proc.prosrc`,
`has_table_privilege`, `information_schema.role_table_grants`, `pg_constraint.confdeltype` —
see §3's and §5's read-only checklists, and the `share_test_questions` check in §5). Only
consider `supabase migration repair` afterwards, and only once each migration in the batch is
confirmed applied *in full* this way — not as a substitute for that verification. This does not
relax §1's existing warning against running `repair` prematurely; it is the same warning,
extended to this batch instead of just `0025`–`0027`.

### Apply order

- `0028` keeps its existing ordering constraint (§4): do not apply it until the deployed
  build's hosted-test attempt creation is confirmed to go through the RPC, or until current
  `main` (which is known to) is deployed first.
- `0034` must land before **two** separate things, and both matter:
  - before `0030` is attempted — it satisfies one of the assertions `0030` trips on (§3), so
    applying it first turns `0030`'s four failing assertions into **three** (`0028` already
    resolves the two INSERT assertions; `0034` resolves the `authenticated` UPDATE assertion;
    the `anon`-DML assertion is untouched by either);
  - before `0033`'s completed-test gate can be treated as *effective*, and before deploying
    app code that relies on that gate holding. `0033` keys its refusal on
    `submitted_at is not null`; without `0034` in place, `authenticated` can still `PATCH` an
    attempt's `submitted_at` back to `null` and the gate never sees a submitted row to refuse
    (§2's `0034` row). Both constraints point at the same practical instruction: apply `0034`
    before `0031`/`0032`/`0033`/§6's deploy, not after.
  `0034` does **not** unblock `0035`: `0035`'s own trip is a separate assertion, the `anon`
  DML invariant (§3), and `0035` has no assertion of its own about `attempts` UPDATE for
  `0034` to satisfy.
- `0036` and its app code ship together in both directions, same as `0031`/§5's app pairing —
  neither the migration nor the deploy is useful applied alone.
- `0030` and `0035` are **expected to abort** until the `anon`-DML decision in §3 is made and
  carried out. That is expected, and is not a failure to route around — it is not something
  to fix by weakening either assertion (§3, §7).

### Full sequence, `0028`–`0036`

One dependency-ordered checklist, replacing the need to reassemble it from the bullets above
and §4/§5. `0030` and `0035` are listed where their dependencies land them but are **deferred**
— do not run them until the `anon`-DML decision in §3 is made; everything after them in this
list does not depend on them.

1. `0028` — gated on confirming the hosted-test RPC path is live (§4's abort condition).
2. `0029` — independent of everything else here; capture the prior answer-key row first (§4).
3. `0034` — apply here, ahead of `0030` and ahead of `0031`/`0032`/`0033`, for both reasons
   above.
4. `0030` — **expected to abort** on the `anon`-DML assertion (§3). Deferred pending that
   decision; do not force it through.
5. `0031` — publish gate; mind §5's ordering trap with the app deploy. **Not
   unconditionally executable**: its own assertion refuses if `authenticated` holds
   table-level UPDATE on `tests`, which the new `published` column would inherit (§5).
   Run the pre-check first. If it fires, narrowing that legacy grant is its own reviewed
   decision — the same class of change as the `anon`-DML question in §3, and not a step
   of this runbook.
6. `0032` — apply immediately after `0031`, per §5's sequence. **Hard dependency:** its body
   reads `tests.published` (`0032:58`), so it cannot be applied at all until `0031` has
   succeeded.
7. `0033` — apply immediately after `0032`, per §5's sequence, and only now that `0034` (step 3)
   is already live, or its gate is not effective (above). **Same hard dependency on `0031`:**
   it reads `tests.published` too (`0033:66`).
8. `0036` — apply before, or together with, the deploy in the next step; the migration and its
   app code are useless applied alone (§2).
9. Deploy (§6) — the app code for `0031`/`0032`/`0033` and for `0036` all ship in this same
   deploy; the preflight now checks for all of them (§2, §6).
10. `0035` — **expected to abort** on the same `anon`-DML assertion as `0030` (§3). Deferred
    pending the same decision; nothing in steps 1–9 unblocks it.

An earlier version of this runbook planned a Phase 1 / Phase 2 split with an outage window,
on the assumption that none of `0024`–`0030` were applied. That assumption was wrong:
`0025`–`0027` are live and the deployed build already uses the token RPCs, so the outage
reasoning no longer applies and the split has been removed.

---

## 3. `0030` will abort on four assertions, not one. That is correct behaviour.

`0030`'s verification block (`supabase/migrations/0030_explicit_data_api_grants.sql:311-429`)
asserts several standing invariants. Four of them fire against production as it stands today:

| Assertion (0030, L338-417) | What it refuses | Fixed by |
|---|---|---|
| `authenticated` cannot INSERT into `attempts` (L338-340) | direct attempt creation, bypassing the token RPCs | `0028` |
| `anon` cannot INSERT into `attempts` (L341-343) | the same bypass, via the anon key | `0028` |
| `authenticated` cannot UPDATE `attempts` (L344-346) | reopening a completed attempt / re-pointing it at another test | `0034` — the **only** migration in this repo that revokes `attempts` UPDATE; before `0034` merged, this assertion was unsatisfiable by any means already in the repo |
| `anon` holds no SELECT/INSERT/UPDATE/DELETE on any `public` table (L397-417) | the legacy auto-expose grant | **nothing yet** — still an open decision, below |

Per §1's evidence table, production still grants `authenticated` both INSERT and UPDATE on
`attempts` today, and still grants `anon` DML broadly (which includes INSERT on `attempts`).
So as of this writing `0030` would fail all four assertions — but not "at once": the
verification block is a single `do $$ ... end $$` that stops at its first `RAISE`, so only
the first failing assertion in file order is ever the one actually reported, and re-running
after fixing it surfaces the next one rather than all of them appearing together. `0028`
resolves both INSERT assertions (`authenticated` and `anon`); `0034` resolves the
`authenticated` UPDATE assertion; the `anon`-DML assertion has no fix in the repo and needs
the decision below before `0030` can pass.

**Confirmed on production:** `anon` holds `SELECT`, `INSERT`, `UPDATE` **and** `DELETE` on
**36 tables** — a legacy of the platform's auto-expose behaviour at provisioning. Until that
is resolved, `0030` will stop, and nothing will be applied.

### This is surface, not an active breach

Verified, so investigation starts from facts rather than alarm:

- **RLS is enabled on every table in `public`.** The only two with zero policies —
  `admin_emails` and `html_test_answer_keys` — are RLS-enabled with no policy, i.e.
  deny-all, which is their documented design.
- **Anonymous reads return nothing.** Using the public anon key against production,
  `profiles`, `attempts`, `results`, `tests`, `questions`, `books`, `words`, `badges`,
  `points_ledger` and `streaks` each returned **0 rows**. The grant lets the request
  through; RLS filters every row.

The grants are unnecessary attack surface that RLS is currently absorbing. They are not
leaking data today.

### One policy worth tightening independently

`weekly_challenges.challenges_select` uses
`((group_id IS NULL) OR in_group(group_id) OR owns_group(group_id))`. The first disjunct is
gated by no auth check, so any row with a NULL `group_id` is world-readable, including by
`anon`. The table currently returns `[]`, so nothing is exposed **today** — but the first
global challenge inserted becomes public. Fix on its own merits; not part of this rollout.

### Required before `0030` can be applied

1. Enumerate the grants:
   ```sql
   select table_name, privilege_type
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
    order by 1, 2;
   ```
2. Decide deliberately whether to revoke them, and record the decision. Revoking `anon` DML
   is a production permission change in its own right and needs its own review — it is not a
   step of this runbook.
3. Only once `anon` holds no DML does `0030` apply cleanly.

> **Do not weaken, comment out, or bypass the assertion to get `0030` through.** Its entire
> purpose is to refuse rather than silently mis-grant. Any change must be a reviewed commit
> with its own justification, never an in-place edit during a production procedure.

### Before you start: read-only checklist

Run these in the dashboard SQL editor before touching anything in §4 or §5. All are
read-only — no writes, safe on production. Run the `tests`/`published` queries only *after*
`0031` has been applied (below); the rest tell you whether the abort conditions in §3 and §5
will actually fire.

Before `0031` (and before `0030`):

```sql
select privilege_type from information_schema.role_table_grants
 where grantee='authenticated' and table_schema='public' and table_name='tests';
select has_table_privilege('authenticated','public.attempts','UPDATE') as blocks_0030_update;
select has_table_privilege('authenticated','public.attempts','INSERT') as blocks_0030_auth_insert;
select has_table_privilege('anon','public.attempts','INSERT') as blocks_0030_anon_insert;
select privilege_type, table_name from information_schema.role_table_grants
 where grantee='anon' and table_schema='public'
   and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
 order by 1, 2;
select count(*) from attempts where submitted_at is null;
```

After `0031` has been applied:

```sql
select has_column_privilege('authenticated','public.tests','published','UPDATE');
```

What each answer means:

- **`role_table_grants` for `authenticated`/`tests`** — run this *before* `0031`. If it lists
  `UPDATE`, that table-level grant is what `0031`'s new `published` column will inherit
  (§5), and the migration is expected to abort until that table-level grant is narrowed.
- **`blocks_0030_update` (`attempts` UPDATE, `authenticated`)** — `true` today; per §3, one of
  the four assertions `0030` currently fails on. Should read `false` once `0034` is applied.
- **`blocks_0030_auth_insert` (`attempts` INSERT, `authenticated`)** — `true` today; another
  of the four. Should read `false` once `0028` is applied.
- **`blocks_0030_anon_insert` (`attempts` INSERT, `anon`)** — a separate assertion from the
  `authenticated` one above; also resolved by `0028`. Confirm both come back `false`, not just
  the `authenticated` one.
- **`role_table_grants` for `anon`** — this is `0030`'s fourth (and `0035`'s only) failing
  assertion: any row returned here means `anon` still holds DML and both migrations will
  abort. This needs the deliberate decision in §3, not a migration.
- **`has_column_privilege(... 'tests','published','UPDATE')`** — only valid *after* `0031` has
  added the column; run it before that and it errors, because the column does not exist yet.
  If this ever comes back `true` post-`0031`, the ordering risk described in §5 has
  materialised: `authenticated` can write `tests.published` directly over PostgREST, which
  `0031`'s own assertion refuses to allow.
- **`count(*) from attempts where submitted_at is null`** — the count of attempts that have
  been started but never submitted. This is not an outage indicator by itself; see "Blast
  radius: what you cannot see" below for what it does and does not tell you.

### Blast radius: what you cannot see

There is no maintenance mode and no write-pause lever anywhere in this codebase.
`SUPABASE_ENABLED` (`src/lib/supabase/env.ts:6`, checked in `src/middleware.ts:3` and `:14`)
does exist, but it is a build-time backend selector, not such a lever: it's a static
`!!NEXT_PUBLIC_SUPABASE_URL && !!NEXT_PUBLIC_SUPABASE_ANON_KEY` check baked in at build time,
whose only effect is to fall back to the pre-Supabase localStorage prototype when Supabase env
vars are absent from the build. It cannot be toggled at runtime during a live migration
window, and flipping it off would not pause writes against an already-configured production
database — it would just build a different app. Beyond that, `src/middleware.ts` only does
auth/admin route gating (redirect signed-out users to `/login`, redirect non-admins away from
`/author`, `/admin`, `/telegram`) — it has no notion of pausing writes or serving a "come back
later" page during a migration window.

No admin page shows a live view of in-flight attempts. The closest thing,
`/admin/students/[id]` (`src/app/api/admin/students/[id]/route.ts`), surfaces an
`attemptsCount` that is a raw count over *all* of a student's attempt rows — started,
abandoned, or submitted, all summed together — with no per-row started/submitted state
shown anywhere in the UI. So the `count(*) ... where submitted_at is null` query above is
the **only** instrument this runbook has for "how many attempts are currently open." It
conflates a student sitting the exam right now with a student who opened the link three
weeks ago and never finished. `started_at` is the only column that can narrow that further
(e.g. filtering to the last hour), and even that is an inference, not a certainty.

Once `0031` is applied and its app code is deployed (§5), `set_test_published(id, false)`
becomes a real per-test pause lever, reachable from the admin share-links page
(`/tests/links`, via `PublishToggle.tsx`) — an admin can stop new attempts against a
specific test without touching the database directly. Before `0031` lands, no such lever
exists for tests already in the running app.

---

## 4. Applying `0028` and `0029`

`0029` is **not inert**: it is `insert ... on conflict (html_test_id) do update`, and per §8
that `do update` can overwrite a pre-existing `html_test_answer_keys` row for the
`present-continuous-bank30.html` test if one already exists with different content — the
only one of the nine outstanding migrations that can overwrite an existing application-data
*value* rather than just a definition. `0028` is the only remaining change of the two that
can break the **running app** (a student-facing path), which is the risk this section's
abort condition is about.

**What the evidence supports:** the DB-rail test flow already goes through
`start_share_attempt`, because attempts are being created under a policy that would
otherwise prevent it (§1). Revoking direct INSERT should be a no-op for that path.

**What the evidence does not cover:** the hosted-HTML test path. `0026`'s
`start_share_html_attempt` exists, but nothing here confirms the *deployed* build calls it
rather than inserting directly. Since the running build cannot be reconstructed from a
commit, this cannot be settled from the repository.

> **Abort condition:** do not apply `0028` until you have confirmed the deployed build
> creates hosted-test attempts via the RPC. If that cannot be confirmed, deploy current
> `main` first — where the RPC path is known to be in the source — and apply `0028`
> immediately afterwards.

> **That fallback is not free, and may not be available at all. Read this before relying
> on it.** Deploying current `main` means passing the preflight (§6), which requires nine
> RPCs — including `set_test_published` and `set_html_test_published` from `0031`,
> `share_attempt_state` from `0032`, and `finalize_html_test_attempt` from `0036`. None of
> those are live today. So "just deploy `main` first" actually means applying `0031`,
> `0032` and `0036` first, in that order, and **`0031` is the migration most likely to
> abort** (§5: the `tests.published` grant assertion).
>
> The consequence, stated plainly: if `0031`'s assertion fires, the fallback is unavailable
> until the legacy table-level `tests` UPDATE grant is narrowed — a separate reviewed
> decision, not a step of this runbook. `0028` then stays unapplied until either that
> decision is made, or the deployed build's hosted-test path is confirmed some other way.
>
> **`0031` is the linchpin of the entire rollout, not just its own step.** `0032` and
> `0033` both read `tests.published` — the column `0031` creates (`0032:58`, `0033:66`).
> If `0031`'s assertion fires, the ADD COLUMN rolls back with it, and neither `0032` nor
> `0033` can be applied at all. So an abort there does not cost you one migration; it stops
> everything from `0031` onward, blocks any deploy (the preflight requires RPCs from
> `0031` and `0032`), and leaves `0028` blocked behind the deploy.
>
> Reachable independently of `0031`: `0029`, `0034` and `0036` outright; `0030` and `0035`
> only in the sense that they are already blocked on the separate `anon`-DML decision; and
> `0028` if — and only if — the deployed build's hosted-test RPC path can be confirmed
> without deploying (§4's abort condition), since that is what removes the need for the
> fallback deploy in the first place. There is no path
> around this short of bypassing the preflight, which would ship a build against a database
> missing the RPCs it calls — publishing errors outright, and without `0036` hosted
> submissions fail at finalization. Neither is an acceptable state to leave students in.
>
> Practical consequence: **run §5's `tests` grant pre-check first, before planning anything
> else.** Its answer determines whether this rollout can proceed at all.
>
> `0036` itself is additive (a new function, no data touched), so applying it early is safe
> and costs nothing if the fallback proves unnecessary. `0032` is likewise additive and
> read-only. `0031` is the one that gates everything.

### Sequence

1. Preview exactly what will run:
   ```
   npx supabase migration list --linked
   npx supabase db push --linked --dry-run
   ```
   > **Abort if:** the dry run lists anything other than what you intend. It **will** list
   > `0025`–`0027` as pending even though they are live (§1), so a push would re-run them.
   > `create or replace function` is idempotent, but the policy and grant statements in
   > those files must be re-read before allowing that.

2. Deploy current `main` (§6) if §4's abort condition applies.

3. Apply `0028`, then verify:
   ```sql
   select has_table_privilege('authenticated','public.attempts','INSERT') as must_be_false;
   ```

4. Before applying `0029`, capture the prior row so an existing answer key is never lost
   without a copy:
   ```sql
   select * from html_test_answer_keys
    where html_test_id in (
      select id from html_tests where storage_path like '%present-continuous-bank30.html'
    );
   ```
   `in`, not `=`: `storage_path` is not unique, and `0029` upserts against *every* suffix
   match. A scalar subquery would error out on a second match and capture nothing —
   failing exactly when there is most to lose.

   Save the result somewhere outside the database before proceeding. If it returns no row,
   `0029`'s insert is a plain insert and there is nothing to lose.

5. Apply `0029`. No verification query is defined for its content — it is a data insert, not
   a grant or policy change, and correctness means matching the bank in the test's own source
   (`hosted-tests/present-continuous-bank30.html`), not a `has_*_privilege` check.

6. Verify the student flow end to end **on a non-production project, or a seeded account you
   own** — never by consuming a real student's attempt.

### Rollback

```sql
grant insert on public.attempts to authenticated;   -- undoes 0028
```

`0029` has no rollback query here — see §8. If the capture step above returned a prior row,
that captured copy is the only way back; without it there is nothing to restore to.

Never disable RLS as a recovery step. Never delete, truncate, or overwrite attempt, result,
or profile rows — there are live students.

---

## 5. Applying `0031` (publish gate) — mind the ordering

`0031` adds `published` to `tests` and `html_tests`, makes the token RPCs refuse
unpublished tests, and adds ADMIN-only `set_test_published` / `set_html_test_published`.

**Existing tests are backfilled as published**, so nothing changes for current students:
in-progress attempts and completed results keep working. The backfill is guarded, so
re-running the migration never re-publishes something an admin has since unpublished.

### The trap

The migration and the app that drives it ship separately, and each is unusable without the
other — in opposite directions:

- **Migration applied, app not deployed.** New uploads default to `published = false`, but
  the deployed admin UI has no publish toggle and `set_test_published` is not called by it.
  Newly uploaded tests are therefore **silently unusable**, with no in-app way to publish
  them. Existing tests are unaffected.
- **App deployed, migration not applied.** The preflight (`npm run deploy`) blocks this
  outright, because `set_test_published` is absent. That is the guard working.

So the two must land close together, and the preflight forces migration-first. Between
applying `0031` and completing the deploy there is a window in which **no test should be
uploaded** — anything created in it starts unpublished and cannot be published until the
deploy lands.

### `0031` will very likely abort too

`0031`'s verification block (`supabase/migrations/0031_publish_gate.sql:305`) asserts
`authenticated` cannot UPDATE `tests.published`:

```sql
if has_column_privilege('authenticated','public.tests','published','UPDATE') then
  raise exception '0031: authenticated can UPDATE tests.published directly';
end if;
```

A newly added column inherits the table's existing grant — `0018_lock_privileged_columns.sql:32-33`
documents exactly this mechanism for why `profiles` and `questions` each needed an explicit
`REVOKE ... FROM authenticated` before their column-level `GRANT` could mean anything:

> a column-level REVOKE does NOT subtract from a *table-level* grant.

`0018` only ever did this for `profiles` and `questions`. It never touched `tests`. If
`authenticated` currently holds a table-level UPDATE grant on `public.tests` — which,
per `0030`'s own header comment, is the expected state for every table under the platform's
legacy auto-expose behaviour, since no migration before `0031` issues a table-level GRANT to
`authenticated` on `tests` — then the brand-new `published` column comes up UPDATE-able by
`authenticated` the instant `alter table tests add column published ...` runs, and `0031`'s
assertion fires. Because the column add and the backfill run inside the same migration, an
abort here rolls back both, and step 2 below never completes.

**Check this before running step 2:**

```sql
select privilege_type from information_schema.role_table_grants
 where grantee='authenticated' and table_schema='public' and table_name='tests';
```

If `UPDATE` is listed, `0031` is expected to abort until that table-level grant is narrowed —
the same kind of reviewed, standalone decision §3 describes for `anon` DML, not something to
patch in-place during this procedure.

### Sequence

1. Confirm nobody is mid-upload, and tell whoever administers tests not to upload until
   step 5 reports success.
2. Apply `0031`, then verify:
   ```sql
   select count(*) filter (where published) as published,
          count(*) filter (where not published) as unpublished
     from tests;
   ```
   > **Abort if:** any pre-existing test comes back unpublished. The backfill did not run.
   > Do not publish them by hand one at a time — investigate why, since the same fault
   > would apply to `html_tests`.
3. Apply `0034` first if it is not already live (Apply order, §2) — `0033`'s gate is not
   effective without it. Then apply `0032`, then `0033`, in that order.
   > **The preflight cannot verify `0033`.** `scripts/preflight-deploy.mjs` only probes for
   > RPC *existence*, and `share_test_questions` has existed under that exact name and
   > signature since `0025`/`0031` — so the preflight will report it present even against a
   > database still running the pre-`0033` body, which has no submitted-attempt check. A
   > green preflight is not evidence `0033` applied.
   >
   > **`npx supabase migration list --linked` cannot confirm this either.** Per §1, that
   > command reports what is recorded in `supabase_migrations.schema_migrations`, and these
   > files are being applied by hand through the dashboard SQL editor (§2), which never writes
   > to that table — the same gap §1 documents for `0025`–`0027`. A hand-applied `0033` will
   > not show as applied in `migration list` output unless it is separately recorded via
   > `migration repair` — and per §1, doing that before confirming the migration is applied
   > in full is exactly the mistake to avoid. A green `migration list` after a repair proves
   > only that someone ran the repair.
   >
   > Confirm it the only way that actually reflects reality: inspect the live function body
   > directly, e.g.
   > ```sql
   > select prosrc from pg_proc
   >  where proname = 'share_test_questions';
   > ```
   > and check it for the submitted-attempt check `0033` adds, rather than trusting either the
   > preflight or the migration history table.
4. Deploy immediately (§6). The preflight will now pass.
5. Verify in the admin share-links page that the publish toggle renders and flips state.

### Rollback

**No tested rollback SQL exists for `0031`.** The gate is the RPC bodies, not the column, so
in principle disabling it without dropping data means restoring the previous function
definitions — the column can stay, harmless and ignored, and dropping it is not necessary and
would lose publish state. But there is no SQL snippet written down here to do that, and it is
not as simple as pulling `0025`/`0026`'s bodies back verbatim:

- `resolve_share_test`, `resolve_share_html_test`, `start_share_attempt`, and
  `start_share_html_attempt` were last defined in `0025`/`0026`, before `0031` added the
  published-check. Restoring those four from `0025`/`0026` is comparatively safe.
- `share_test_questions` is different: `0031` replaced `0025`'s version, and `0033` replaced
  `0031`'s version again to add the submitted-attempt gate (§2). Restoring `share_test_questions`
  from `0025` (or from `0031`) would also silently undo `0033` and reopen the direct-RPC
  bypass §2 describes — a student with a submitted attempt could pull the full question bank
  again. If `0033` has been applied, its body must be preserved (or reproduced with the
  published-check removed) rather than blindly overwritten by an older version.

So: either write explicit SQL that restores the pre-`0031` bodies for the other four functions
*and* a version of `share_test_questions` that keeps `0033`'s submitted-attempt gate, or accept
that rolling back `0031` requires deliberately coordinating `0033`'s state and the app deploy
together — not a solo SQL-editor action.

> **Do not** work around an unpublished test by editing `tests.published` directly in the
> SQL editor. `authenticated` deliberately has no UPDATE on it, and the admin RPC exists so
> that publishing is a single auditable path. Reaching around it is exactly the out-of-band
> change that produced the history/schema divergence in §1.

---

## 6. Deploying

A merge does not deploy. Production requires an explicit:

```
npm run deploy
```

which runs `scripts/preflight-deploy.mjs` first (PR #13). The preflight probes the target
database for every RPC the code calls and **blocks the deploy** if one is missing, using
only the public anon key and writing nothing. `SKIP_DEPLOY_PREFLIGHT=true` bypasses it,
loudly — don't.

The preflight now includes `finalize_html_test_attempt` (`0036`, §2) alongside the earlier
`0025`/`0026`/`0032` entries, so a deploy against a database missing `0036` is blocked the same
way a missing `0031`/`0032` RPC already was. This existence probe still cannot distinguish a
correct RPC body from a stale one with the same name and signature — §5 already covers the one
case where that matters (`0033`'s `share_test_questions`, which reuses a pre-existing name).

Deploy from a **clean checkout**, not a dirty working tree. The current inability to say what
is running in production is a direct consequence of `gitDirty` deploys, and it is why §1 and
§4 still contain unresolved unknowns.

---

## 7. Do not

- Repair the migration history until each migration is confirmed applied *in full* (§1).
- Weaken or bypass `0030`'s assertion block (§3).
- Revoke `anon` DML as an undocumented side effect — it needs its own review (§3).
- Apply `0028` before confirming the hosted-test path uses the RPC (§4).
- Upload a test between applying `0031` and completing the deploy (§5).
- Edit `tests.published` directly in the SQL editor — publish through the admin RPC (§5).
- Deploy from a dirty working tree (§6).
- Disable RLS as a recovery step.
- Delete, truncate, or overwrite student data.
- Verify anything by opening or starting a test with a real student account.
- Record credentials, tokens, project refs, or connection strings here or in any commit.

---

## 8. Rollback honesty

§4 documents a rollback for `0028`. That is the only migration this runbook currently gives
tested rollback SQL for. §5 discusses rolling back `0031` at length, but — as that section now
states — no tested rollback SQL is supplied there either, because a safe rollback depends on
whether `0033` has since been applied. Here is what's true for all nine outstanding
migrations, stated plainly rather than assumed:

| Migration | Reversible? | How |
|---|---|---|
| `0028` | yes | `grant insert on public.attempts to authenticated;` — documented in §4. |
| `0029` | **no, not cleanly** | It `insert ... on conflict (html_test_id) do update`s `html_test_answer_keys`. This is the **only one of the nine that can overwrite a pre-existing application-data value** — an existing answer key row. (Several others overwrite *definitions*, not data: `0031` replaces five RPC bodies and writes a `published` flag onto every existing test/`html_test` row as part of its backfill; `0033` replaces the `share_test_questions` body; `0035` replaces a policy, two function bodies, and an FK constraint's delete action. None of those touch a pre-existing application-data *value* the way `0029` does.) The `html_test_answer_keys` row `0029` overwrites is not student data and the no-deletion rule does not apply to it, but if the row it replaces was hand-tuned, that tuning is gone unless it was captured beforehand. There is no rollback query written down here because there is nothing to restore to without a prior copy of the row. |
| `0030` | not documented here | Its grants are additive (`GRANT SELECT`, etc. — see the file's own "WHAT THIS MIGRATION DELIBERATELY DOES NOT DO" comment) and each could in principle be undone with a matching `REVOKE`, but this runbook does not enumerate that list. In any case `0030` is expected to abort per §3 until the `anon`-DML decision is made, so it is not expected to apply at all in its current form. |
| `0031` | not documented here | No tested rollback SQL exists. In principle, restore the pre-`0031` RPC bodies and leave the `published` column in place — but `share_test_questions` cannot be restored from `0025`/`0026` alone if `0033` has since applied, without reopening the bypass `0033` closes. See §5. |
| `0032` | not documented here | Adds `share_attempt_state` only. Reversible in principle by dropping the function, but no drop statement is written down, and dropping it while the deployed app still calls it (§2) breaks every share-link render — do not do this without confirming the app no longer calls it first. |
| `0033` | not documented here | `create or replace function share_test_questions(...)`. Reversible in principle by restoring the pre-`0033` body — last defined in `0031` (which itself replaced `0025`'s version) — but that reopens the direct-RPC bypass §2 describes — reverting this is reintroducing a known hole, not a neutral rollback. |
| `0034` | yes, in principle, `authenticated` only | `0034` revokes from both `authenticated` and `anon` at once, but by the time a rollback of `0034` would be considered, `0030`/`0035` are expected to have already applied — which requires the separate, deliberate `anon`-DML decision in §3 to have already stripped `anon` of DML across the board. A rollback here must not blindly regrant to `anon`; doing so would undo that unrelated decision as a side effect and recreate the exact invariant §3's decision and `0030`/`0035`'s assertions exist to prevent. Restore only the privileges `0034` took from `authenticated`, captured from what it revoked: `grant update, delete on public.attempts to authenticated; grant insert, update, delete on public.attempt_answers to authenticated;` — `anon` is intentionally left out. Even scoped to `authenticated` only, doing this reopens the attempt-reopen bypass `0034` exists to close, and un-satisfies one of `0030`'s four assertions (§3). Not written down as a supported rollback path for that reason. |
| `0035` | partially | The RLS-helper grants and `group_xp_leaderboard()`/`books_write` redefinitions are reversible in principle by restoring prior function/policy bodies, none of which are written down here. The `attempt_answers.question_id` FK change (`ON DELETE RESTRICT`, replacing `ON DELETE NO ACTION` — not `CASCADE`; see §2) is also reversible as a schema change: a faithful rollback restores `NO ACTION`. `NO ACTION` still makes the database refuse the delete — it is not `CASCADE`, and nothing in this schema declares the constraint `DEFERRABLE`, so the refusal is immediate either way (§2). Reverting to `NO ACTION` does **not** remove the database-level backstop and does **not** leave the app-layer pre-check as the only thing standing between a delete and a student's graded answers; the database still refuses on its own. What reverting loses is `RESTRICT`'s explicit, self-documenting semantics and its immunity to a future `DEFERRABLE` change on the constraint (§2) — not the refusal itself. Still not a rollback to reach for without reason. |
| `0036` | yes, in principle | Adds `finalize_html_test_attempt` only; dropping it is a clean schema change. But it ships with app code that calls it (§2), so — same as `0032` — do not drop it while the deployed app still expects it. |

**No app-rollback procedure exists at all.** Per §1, the running production build was
deployed `gitDirty` — built from a working tree, not a clean commit — and by that same
evidence cannot be reconstructed from any commit in this repository. If a deploy needs to be
rolled back, Vercel's own deployment history is the only way back to a previous running
build; there is no `git checkout <sha> && npm run deploy` that reproduces what is live today.
