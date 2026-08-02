# Lexora Platform — working agreement

## Workflow: agents build, Codex audits

Every code change follows this loop. Do not skip the audit.

1. **Delegate the work to subagents.** Claude orchestrates and reviews; Sonnet
   subagents do the hands-on editing. Split work so no two agents write the same
   file in the same pass.
2. **Codex audits — every time.** After the agents finish, run Codex against the
   resulting diff before reporting anything as done:

   ```
   codex exec --skip-git-repo-check "Review the uncommitted working-tree changes
   (run 'git diff' yourself). Cite file:line, say what fails, rank by severity.
   Do NOT modify any files."
   ```

   Codex is installed at `~/.npm-global/bin/codex`. Gemini (`gemini -p`) is
   available as a second opinion.
3. **Verify Codex's findings yourself** before passing them to the user. Codex is
   accurate but its severity ratings drift — read the cited lines and correct the
   claim if it overstates or understates the impact.
4. **Re-audit after fixes.** A fix pass is not finished until Codex has seen the
   corrected diff.

## Security rules for this codebase

- **Fail closed.** Anything gating question content must serve the test only when
  a check *positively confirms* the student is allowed. Never let a missing row,
  a Supabase `{ error }` value, or a swallowed exception fall through to serving
  content.
- **Supabase errors are values, not throws.** `const { data } = await supabase.rpc(...)`
  silently discards `error`, and a `try/catch` around it will not fire. Always
  destructure and handle `error`.
- **Server-side enforcement, not UI hiding.** Hiding an element with a CSS class,
  or checking a rule in a client component after the server already serialized the
  data, is not enforcement. Gate before the fetch, or in the RPC.
- **Never remove student data.** No drop/truncate/overwrite — live students are in
  production. Migrations are additive only (`create or replace` is fine).
- **`answer_key` never leaves the server.** Grading stays server-side.

## Test delivery rails

There are three, and a rule must be enforced on each one separately:

- **Hosted HTML** — `hosted-tests/*.html` served through `src/app/ht/[token]/route.ts`,
  self-grading in the browser, score posted back via the injected bridge. Proctor
  lockdown is injected here too.
- **DB-backed** — `/t/<token>`, questions from the `share_test_questions` RPC,
  graded server-side in `src/lib/data/submit.ts`.
- **Local/offline fallback** — `/tests/<id>` off `localStorage` (`tp.attempts`)
  when Supabase is disabled. Client-side only; treat its guarantees as advisory.

## Deploy

Vercel has **no GitHub auto-deploy**. Pushing does not ship. Deploy with:

```
npx vercel@latest deploy --prod --yes
```
