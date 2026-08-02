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

Six migrations remain. Only one is subtractive against the running app, and one has an
ordering constraint of its own.

| Migration | Effect | Risk against the running app |
|---|---|---|
| `0028` | `revoke insert on attempts from authenticated` | **the one to be careful with** — §4 |
| `0029` | answer-key content | none |
| `0030` | enumerated per-table grants; `anon` gets nothing | none functionally, but **expected to abort** — §3 |
| `0031` | publish gate: tests start unpublished and must be published by an admin | none for existing tests, but **the ordering matters** — §5 |
| `0032` | adds `share_attempt_state`, a read-only, `authenticated`-only sibling of `start_share_attempt` used during the `/t/<token>` render to check submission state before questions are fetched | none for existing tests or attempts — additive and read-only. The preflight (§6) now requires it; deploying app code that calls it against a database without it breaks every share-link render with "Could not open this test." |
| `0033` | `create or replace function share_test_questions(p_token text)` — adds a submitted-attempt check: a student holding a submitted attempt gets zero rows back, teachers untouched | none for existing tests or attempts — additive, redefines a function body only. **But do not skip it**: the app-level gate added in `/t/[token]` (checks `share_attempt_state` from `0032` before rendering questions) only covers normal page navigation. `share_test_questions` is itself a public RPC, callable directly over PostgREST by any authenticated session holding the share token — without `0033`, a student who already completed a test can call it straight from the browser with their own JWT and the token, and get the full question bank back. `0033` closes that path at the RPC itself. |

An earlier version of this runbook planned a Phase 1 / Phase 2 split with an outage window,
on the assumption that none of `0024`–`0030` were applied. That assumption was wrong:
`0025`–`0027` are live and the deployed build already uses the token RPCs, so the outage
reasoning no longer applies and the split has been removed.

---

## 3. `0030` will abort. That is correct behaviour.

`0030` ends with an assertion block that refuses the migration if any standing invariant is
violated. One invariant is that `anon` holds no DML privilege in `public`.

**Confirmed on production:** `anon` holds `SELECT`, `INSERT`, `UPDATE` **and** `DELETE` on
**36 tables** — a legacy of the platform's auto-expose behaviour at provisioning. `0030`
will therefore stop, and nothing will be applied.

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

---

## 4. Applying `0028` and `0029`

`0029` is inert. `0028` is the only remaining change that can break the running app.

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

3. Apply, then verify:
   ```sql
   select has_table_privilege('authenticated','public.attempts','INSERT') as must_be_false;
   ```

4. Verify the student flow end to end **on a non-production project, or a seeded account you
   own** — never by consuming a real student's attempt.

### Rollback

```sql
grant insert on public.attempts to authenticated;   -- undoes 0028
```

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
3. Apply `0032`, then `0033`, in that order.
   > **The preflight cannot verify `0033`.** `scripts/preflight-deploy.mjs` only probes for
   > RPC *existence*, and `share_test_questions` has existed under that exact name and
   > signature since `0025`/`0031` — so the preflight will report it present even against a
   > database still running the pre-`0033` body, which has no submitted-attempt check. A
   > green preflight is not evidence `0033` applied. Confirm it some other way, e.g.
   > `npx supabase migration list --linked`, before treating the direct-RPC bypass as closed.
4. Deploy immediately (§6). The preflight will now pass.
5. Verify in the admin share-links page that the publish toggle renders and flips state.

### Rollback

The gate is the RPC bodies, not the column. To disable it without dropping data, restore
the previous function definitions from `0025`/`0026` — the column can stay, harmless and
ignored. Dropping the column is not necessary and would lose publish state.

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
