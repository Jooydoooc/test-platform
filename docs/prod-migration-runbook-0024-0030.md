# Production runbook — migrations 0024–0030

**Status: not started. Nothing in this runbook has been applied to production.**

Scope: applying the outstanding migrations from PR #12 (merged to `main`) to the
production Supabase project, and deploying the app that depends on them.

This document contains no credentials, tokens, or connection strings. Every value the
operator needs is read at run time from the Supabase dashboard or existing environment
configuration and must never be pasted into this file or into a commit.

Audience: whoever owns the production project. Steps requiring interactive auth must be
run by that person.

---

## 1. The core constraint

Two of these migrations — `0025` and `0028` — **remove capabilities the currently-deployed
app still depends on**. They are additive to the schema but subtractive to the running
application, so they cannot be applied ahead of the deploy.

| Migration | Effect | Safe against the deployed app? |
|---|---|---|
| `0024` integrity flags | adds integrity columns/table | **Already applied in production** — out of scope, listed for completeness |
| `0025` link-gated tests | restricts `tests` SELECT to rows the caller holds an attempt on; adds the token RPCs | **No** — see below |
| `0026` attempt insert via RPC | adds `start_share_html_attempt` | **Yes** — adds a function nothing calls yet |
| `0027` html answer keys | `revoke all on html_test_answer_keys from authenticated, anon` | **Yes** — verified: `git grep html_test_answer_keys origin/main -- src` returns 0 hits, so the deployed app never touches that table |
| `0028` revoke attempt insert | `revoke insert on attempts from authenticated` | **No** — see below |
| `0029` bank30 answer key | answer-key content | **Yes** |
| `0030` explicit grants | enumerated per-table grants; grants `anon` nothing | **Yes** — additive, but has a hard stop condition (§5) |

Why `0025` and `0028` are unsafe on their own. Note the deployed build is **not** a clean
checkout of `main`: Vercel records every recent production deployment as `gitDirty: "1"`,
built from a working tree, so what is running cannot be reconstructed from a commit. The
nearest recorded commit still shows both direct paths:

- `getTestByShareToken` reads `.from("tests").select(...).eq("share_token", token)`
  directly. Under `0025` that returns nothing, so **every share link renders
  "Link not found."**
- `startAttempt` performs `.from("attempts").insert({ student_id, test_id })`. Under
  `0028` that is revoked, so **no student can start any test.**

The replacement RPC paths (`resolve_share_test`, `start_share_attempt`) are on `main`
(PR #12, merged) but not yet deployed. `0025` and `0028` must therefore land in the same
window as the deploy — and see the §2 warning: those functions already exist in production
even though the migrations are unrecorded, so confirm what is actually live first.

---

## 2. Prerequisites

1. Interactive auth, run by the project owner:
   ```
   npx supabase login
   npx supabase link --project-ref <production project ref>
   ```
   The project ref is the subdomain in `NEXT_PUBLIC_SUPABASE_URL`. Do not record it here.

2. Re-establish the current state — do not trust the snapshot below without re-running it:
   ```
   npx supabase migration list --linked
   ```

   **Recorded state as of 2026-08-01:**

   | Migration | Recorded on remote |
   |---|---|
   | `0001`–`0019`, `0021`–`0023` | applied |
   | `0024` | **applied** — it is *not* part of this rollout any more |
   | `0025`–`0030` | **not applied** |

   (There is no `0020`; the sequence skips it.)

   > ### ⚠ The recorded history and the live schema disagree — resolve this first
   >
   > A read-only probe of the production Data API on the same date found that
   > `resolve_share_test`, `share_test_questions`, `start_share_attempt` and
   > `start_share_html_attempt` **already exist** in production: calling them as `anon`
   > returns `42501 permission denied`, not `404`/`PGRST202`. A function that does not
   > exist cannot return "permission denied".
   >
   > So objects from `0025`/`0026` are present in the database while
   > `supabase_migrations.schema_migrations` records those migrations as never applied.
   > Something was applied out-of-band without being recorded.
   >
   > **What is still unknown:** whether the rest of `0025` — the restrictive `tests`
   > SELECT policy, the `revoke`s — is also live, or whether only the functions were
   > created. That distinction decides whether Phase 2 is routine or dangerous, because
   > if the policy is already live then the currently-deployed app's direct
   > `.from("tests").select().eq("share_token", ...)` path is already failing.
   >
   > **Before running any push**, determine which parts of `0025`–`0029` are actually
   > present, e.g. by inspecting the live policies and grants directly:
   > ```sql
   > select polname, polcmd from pg_policy
   >  where polrelid = 'public.tests'::regclass;
   > select has_table_privilege('authenticated','public.attempts','INSERT') as attempts_insert;
   > select has_column_privilege('authenticated','public.questions','answer_key','SELECT') as answer_key;
   > ```
   > Reconcile the history to reality with `supabase migration repair` (§3.4) **only for
   > migrations you have confirmed are fully applied** — never for a partially applied one.
   >
   > Do **not** verify this by opening or starting a test with a real student account.
   > Attempts are one-per-student-per-test forever, so that would permanently consume a
   > real student's only attempt and write data that cannot be removed.

3. Confirm a restore path exists: Supabase dashboard → Database → Backups. Confirm PITR
   is enabled, or take a manual backup, before Phase 1.

4. Confirm live traffic is low. Phase 2 has an unavoidable outage.

> **Abort condition (all phases):** if `supabase migration list --linked` cannot be run,
> or its output does not match the recorded expectation, stop. Do not proceed on a
> database whose migration state is unknown.

---

## 3. Phase 1 — additive, no outage (`0026`, `0027`, `0030`)

These three coexist with the currently-deployed app and can be applied outside a window.

`supabase db push` applies **all** pending migrations and would pull `0025`/`0028` in with
them, so Phase 1 is applied one migration at a time and then reconciled with the supported
repair workflow.

Repeat the following loop **for each** of `0026`, `0027`, `0030`, in that order.
`0024` is excluded: it is already applied and recorded.
Do not batch them.

### 3.1 Record state before

```
npx supabase migration list --linked
```
Capture the output. `<version>` must not yet appear as applied.

### 3.2 Apply the single migration

Apply only that migration's SQL against production, using a connection obtained from the
dashboard at run time (never stored in the repo):

```
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql
```

`ON_ERROR_STOP=1` is mandatory — it aborts the whole file on the first error rather than
leaving a half-applied migration.

> **Abort if:** psql reports any error. The statement runs in a transaction and rolls
> back. Do **not** repair, do **not** re-run. Investigate the error first.

### 3.3 Verify the migration actually did its job

Before repairing, confirm the intended effect independently — the repair command only
records state, it does not check anything.

- `0026` — the function exists:
  ```sql
  select proname from pg_proc where proname = 'start_share_html_attempt';
  ```
- `0027` — the table is sealed to both roles:
  ```sql
  select has_table_privilege('authenticated','public.html_test_answer_keys','SELECT') as must_be_false,
         has_table_privilege('anon','public.html_test_answer_keys','SELECT')          as must_be_false_too;
  ```
- `0030` — the migration raises `0030_explicit_data_api_grants.sql: all invariants
  verified.` on success. See §5 for the failure path.

> **Abort if:** any verification query returns an unexpected result. Do not repair a
> migration you have not confirmed. An unrepaired-but-applied migration is recoverable;
> a repaired-but-not-actually-applied one corrupts the migration history.

### 3.4 Reconcile the migration history

Only after §3.3 passes:

```
npx supabase migration repair <version> --status applied --linked
```

Never write to `supabase_migrations.schema_migrations` directly. The repair command is
the supported path and is what later `db push` runs reconcile against.

### 3.5 Record state after

```
npx supabase migration list --linked
```

`<version>` must now appear as applied, and nothing else may have changed.

> **Abort if:** the list shows anything other than the single expected transition. Stop
> and reconcile before touching the next migration.

### Phase 1 rollback

Each of these is additive, so rollback is rarely needed and is per-migration:

- `0026` — leaving it applied is harmless; the added function is unused
  by the deployed app. Prefer leaving them over reversing.
- `0027` — reversible with `grant select on public.html_test_answer_keys to authenticated;`
  but only do this if something is demonstrably broken by it; the deployed app does not
  read that table.
- `0030` — reversible by revoking the specific grants it issued. Leaving it applied is
  harmless: it only widens `authenticated` to what the app already needs and grants `anon`
  nothing.

If a rollback is performed, immediately run
`npx supabase migration repair <version> --status reverted --linked` and re-run
`supabase migration list --linked` to confirm.

**Never** delete, truncate, or overwrite attempt, result, or profile rows as part of any
recovery. There are live students.

---

## 4. Phase 2 — the window (`0025`, `0028`, `0029` + merge + deploy)

From the moment `0025`/`0028` land until the new app is live, **students cannot open or
start tests**. Keep this window as short as possible and do not begin it unless you can
complete the deploy immediately.

### 4.1 Preview exactly what will be applied

```
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

> **Abort if:** the dry run lists anything other than `0025`, `0028`, `0029`. If Phase 1
> migrations still appear pending, §3.4 did not complete — go back and reconcile. Do not
> push to "fix it up".

### 4.2 Merge

Merge PR #12 into `main`. Do not deploy yet.

### 4.3 Apply

```
npx supabase db push --linked
```

> **Abort if:** the push fails partway. Determine which migrations applied via
> `supabase migration list --linked` before any retry. Retrying blind risks re-running a
> partially applied migration.

### 4.4 Deploy immediately

A merge does not deploy. Production requires an explicit deploy:

```
npx vercel@latest deploy --prod --yes
```

> **Abort if:** the build fails. The database is now ahead of the deployed app and
> students cannot start tests — this is the highest-urgency state in the runbook. Go
> straight to §4.6.

### 4.5 Verify on production with a real student account

In this order:

1. Open a share link → the test resolves (not "Link not found") → confirms `0025` and the
   new `resolve_share_test` path.
2. Begin the test → exactly one attempt row is created → confirms `0028` and
   `start_share_attempt`.
3. Submit → a `results` row is written and XP is awarded exactly once.
4. Re-open the same link → re-entry is refused and there is still exactly one attempt row.

> **Abort if:** step 1 or 2 fails. The app and schema are mismatched; go to §4.6.

### 4.6 Phase 2 rollback

Ordered by preference:

1. **Roll the app forward or back at the deploy layer first.** Promote the previous known
   good Vercel deployment, or redeploy. This is the fastest way out and touches no data.
2. If the app cannot be made to work, restore the pre-`0025` behaviour at the database
   layer:
   ```sql
   grant insert on public.attempts to authenticated;   -- undoes 0028
   ```
   `0025`'s policy change must be reversed by re-applying the prior policy definition from
   `0002_rls.sql`, not by disabling RLS. **Never disable RLS as a recovery step.**
3. Record any reversal with
   `npx supabase migration repair <version> --status reverted --linked`, then re-run
   `supabase migration list --linked`.

**Never** delete, truncate, or overwrite student data during recovery.

---

## 5. `0030` assertion failure is a stop condition

`0030` ends with an assertion block that aborts the migration if any standing security
invariant is violated: `questions.answer_key` selectable by `authenticated`,
`attempts` insertable or updatable by `authenticated`, `html_test_answer_keys` readable by
`authenticated` or `anon`, `finalize_test_attempt` executable by `authenticated` or
`anon`, or `anon` holding any DML privilege in `public`.

The `anon` check is the one most likely to fire in production: the project was provisioned
under the platform's legacy auto-expose behaviour, so `anon` may already hold
SELECT/INSERT/UPDATE/DELETE on `public` tables. Check before applying:

```sql
select table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public'
   and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
 order by 1, 2;
```

- **Empty result** → `0030` will apply cleanly.
- **Non-empty result** → **stop.** This is a real finding about production, not a defect
  in the migration: signed-out callers currently hold DML privileges on those tables. RLS
  still filters rows, but the grant is surface that should not exist. Investigate what
  depends on it, decide deliberately whether to revoke it, and record that decision.

If the assertion fires, the migration aborts and nothing is applied — that is the intended
behaviour.

> **Do not** weaken, comment out, or bypass the assertion block to get the migration to
> pass. Its whole purpose is to refuse rather than silently mis-grant. Any change to it
> must be a reviewed commit with its own justification, not an in-place edit during a
> production procedure.

---

## 6. Do not

- Apply `0025` or `0028` without deploying the new app in the same window.
- Run `supabase db push` during Phase 1 — it would pull `0025`/`0028` in with it.
- Write to `supabase_migrations.schema_migrations` directly; use `migration repair`.
- Repair a migration before independently verifying it applied (§3.3).
- Weaken or bypass `0030`'s assertion block (§5).
- Disable RLS as a recovery step.
- Delete, truncate, or overwrite attempt, result, or profile rows. There are live students.
- Record credentials, tokens, or connection strings in this file or any commit.
