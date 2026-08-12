import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Lock,
  Maximize,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { Badge, LinkButton } from "@/components/ui";
import { BriefingRule } from "@/components/exam/SecureBriefing";
import { getServerUser } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { HOSTED_LEVEL_LABEL } from "@/lib/data/hosted-tests";
import type { TestSkillScope } from "@/lib/database.types";

// Mirrors scopeLabel()'s output in CategoryTests.tsx (not exported there, so
// reproduced here rather than reaching into that file for an unexported
// helper).
const SCOPE_LABEL: Record<TestSkillScope, string> = {
  GRAMMAR: "Grammar",
  VOCABULARY: "Vocabulary",
  READING: "Reading",
  LISTENING: "Listening",
  MIXED: "Mixed",
};

// Detail page for a hosted HTML test, sitting between the Test Center card and
// the exam itself (/ht/<token>). Reading this page must NEVER create or
// resume an attempt: no start_share_html_attempt call, no fetch of /ht/<token>
// here. Only resolve_share_html_test (SECURITY DEFINER, mints nothing) is
// used to identify the test.
export default async function HostedTestDetailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await getServerUser();
  if (!user) redirect(`/login?next=/tests/hosted/${token}`);

  const supabase = await createClient();

  // Fail closed: destructure and handle BOTH data and error. An RPC error, a
  // null row, or (by construction, since getServerUser already redirected)
  // no session must all end in "can't open this test" -- never in a page that
  // offers a Start button. A missing row is not a permission grant either way.
  const { data: test, error } = await supabase
    .rpc("resolve_share_html_test", { p_token: token })
    .maybeSingle();

  if (error || !test) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-xl font-bold text-brand-600">
          Can’t open this test
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          This link is invalid, has changed, or you don’t have access to it.
          Ask your teacher for a new one.
        </p>
        <Link
          href="/tests"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Test Center
        </Link>
      </div>
    );
  }

  // Richer metadata (skill_scope, level) is gated by html_tests_select
  // (migration 0025): a direct select only returns a row once this student
  // already has an attempt on the test, or for staff. A student who has not
  // started yet gets nothing back here -- that is expected RLS behaviour, not
  // an error, so it must never block the page or the Start button. Only the
  // `title` from the RPC above is guaranteed.
  //
  // `error` is destructured and handled rather than discarded, per CLAUDE.md —
  // but handled here means DEGRADE, not fail closed, and the distinction is
  // deliberate. This query gates nothing: it feeds two decorative badges. The
  // access decision is `resolve_share_html_test` above, and the Begin-vs-
  // Completed decision is the attempt read below, which does fail closed.
  // Turning a hiccup on a cosmetic read into "you can't sit your exam" would
  // be a worse outcome than a page with two missing badges, so an error is
  // treated exactly like RLS's expected empty result.
  const { data: meta, error: metaError } = await supabase
    .from("html_tests")
    .select("skill_scope, level")
    .eq("id", test.id)
    .maybeSingle();

  const metaSafe = metaError ? null : meta;

  const isStudent = user.role === "STUDENT";

  // Completion is terminal, but only "current" (non-superseded) attempts
  // count -- migration 0037 lets an admin reopen a completed test for one
  // student by superseding the old attempt row, and ignoring that filter
  // would keep reporting "completed" forever, trapping the student out of a
  // test just reopened for them. At most one non-superseded attempt row can
  // exist per student per test (the partial unique index enforces it).
  let attemptRow: { submitted_at: string | null } | null = null;
  if (isStudent) {
    const { data: attemptData, error: attemptError } = await supabase
      .from("attempts")
      .select("submitted_at")
      .eq("html_test_id", test.id)
      .eq("student_id", user.id)
      .is("superseded_at", null)
      .maybeSingle();

    // Fail closed: this read decides whether a student sees "Begin" or
    // "Completed". An error here is NOT the same as "no attempt row" — that
    // would mislabel a possibly-already-completed student as not started and
    // hand them a Begin button. Refuse to render the page at all rather than
    // guess.
    if (attemptError) {
      return (
        <div className="mx-auto max-w-md py-16 text-center">
          <h1 className="font-display text-xl font-bold text-brand-600">
            Can’t open this test
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            We couldn’t verify your attempt status. Please try again, or
            contact your teacher if this keeps happening.
          </p>
          <Link
            href="/tests"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Test Center
          </Link>
        </div>
      );
    }

    attemptRow = attemptData;
  }

  const completed = isStudent && attemptRow?.submitted_at != null;
  const inProgress = isStudent && attemptRow != null && !completed;
  const notStarted = isStudent && attemptRow == null;

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-10">
      <Link
        href="/tests"
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Test Center
      </Link>

      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card-hover">
        <div className="bg-brand-600 p-7 text-white">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand" className="bg-white/10 text-slate-100 ring-white/15">
              <ShieldCheck className="h-3 w-3" />
              Secure
            </Badge>
            {metaSafe?.skill_scope && (
              <Badge tone="brand" className="bg-white/10 text-slate-100 ring-white/15">
                {SCOPE_LABEL[metaSafe.skill_scope]}
              </Badge>
            )}
            {metaSafe?.level && (
              <Badge tone="brand" className="bg-white/10 text-slate-100 ring-white/15">
                {HOSTED_LEVEL_LABEL[metaSafe.level]}
              </Badge>
            )}
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
            {test.title}
          </h1>
        </div>

        <div className="space-y-5 p-7">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              What to expect
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This is a proctored, single-attempt test. Read how it works
              before you press Begin — once you start, these rules are what
              actually happens, not fine print.
            </p>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Lock className="h-3.5 w-3.5" />
                </span>
                <span>
                  <b>Single attempt.</b> Once submitted, it can’t be retaken.
                </span>
              </li>
              <BriefingRule icon={Ban}>
                <b>Answers lock when you move to the next question.</b> There
                is no going back.
              </BriefingRule>
              <BriefingRule icon={Maximize}>
                It runs in <b>fullscreen</b>. Leaving fullscreen is recorded.
              </BriefingRule>
              <BriefingRule icon={AlertTriangle}>
                <b>Stay on this tab.</b> The first tab or app switch warns
                you; the second submits the test automatically.
              </BriefingRule>
              <BriefingRule icon={Lock}>
                Copy, paste and right-click are disabled.
              </BriefingRule>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
                <span>
                  <b>Auto-graded.</b> Your result is saved to your progress
                  the moment it submits.
                </span>
              </li>
            </ul>
          </div>

          {/* Attempt state -- the reason this page exists: read what happens
              before committing, instead of a card tap silently starting the
              clock. */}
          {!isStudent ? (
            <div className="rounded-2xl border border-line bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Staff preview
              </p>
              <p className="mt-1 text-sm text-slate-600">
                You’re signed in as {user.role.toLowerCase()}. Opening this
                test shows an unscored preview — it does not create or count
                as a student attempt.
              </p>
              <LinkButton
                href={`/ht/${token}`}
                variant="secondary"
                className="mt-3 w-full justify-center"
              >
                Open preview
              </LinkButton>
            </div>
          ) : completed ? (
            <div className="rounded-2xl border border-line bg-emerald-50/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Submitted on{" "}
                <span className="font-mono tabular-nums">
                  {new Date(attemptRow!.submitted_at as string).toLocaleDateString()}
                </span>
                . This was a single-attempt test — there is no way back in.
              </p>
              <Link
                href="/results"
                className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                View your results
              </Link>
            </div>
          ) : inProgress ? (
            <div className="rounded-2xl border border-line bg-accent-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                You already opened this test
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Your attempt is already counted, so leaving does not reset
                it — resume whenever you’re ready.
              </p>
              <LinkButton
                href={`/ht/${token}`}
                className="mt-3 w-full justify-center"
              >
                <PlayCircle className="h-4 w-4" />
                Resume test
              </LinkButton>
            </div>
          ) : notStarted ? (
            <div>
              <p className="text-sm font-semibold text-amber-700">
                Opening this test starts your attempt. It cannot be undone.
              </p>
              <LinkButton
                href={`/ht/${token}`}
                className="mt-3 w-full justify-center"
              >
                <PlayCircle className="h-4 w-4" />
                Begin test
              </LinkButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
