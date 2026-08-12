"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { ExamResult } from "@/components/exam";
import { QuestionRunner, type SubmitMeta } from "@/components/QuestionRunner";
import {
  bookOf,
  gradeTest,
  getTest,
  maxScore,
  saveAttempt,
  uid,
  useAttempts,
} from "@/lib/store";
import { type Test } from "@/lib/types";
import { loadConfig, sendMessage } from "@/lib/telegram-client";
import { useSession } from "@/lib/auth";

type Answers = Record<string, string[]>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Fire off any configured Telegram notifications for a finished attempt.
// Best-effort: failures are swallowed so they never block the results screen.
async function notifyTelegram(
  test: Test,
  takerName: string,
  score: number,
  total: number,
  group: string,
  level: string,
) {
  const cfg = loadConfig();
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const who = escapeHtml(takerName);

  if (cfg.notifyOnSubmit && cfg.notifyChatId.trim()) {
    const meta = [group && `Group: ${group}`, level && `Level: ${level}`]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" · ");
    void sendMessage({
      chatId: cfg.notifyChatId,
      text:
        `<b>${who}</b> finished <b>${escapeHtml(test.title)}</b>\n` +
        `Score: <b>${score}/${total}</b> (${pct}%)` +
        (meta ? `\n${meta}` : ""),
    });
  }

  if (cfg.sendResultToStudent) {
    const chatId = cfg.studentChats[takerName.trim().toLowerCase()];
    if (chatId) {
      void sendMessage({
        chatId,
        text:
          `Hi ${who}! Your result for <b>${escapeHtml(test.title)}</b>:\n` +
          `<b>${score}/${total}</b> (${pct}%)`,
      });
    }
  }
}

type Phase = "start" | "running" | "done";

export default function TakeTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useSession();
  const attempts = useAttempts();
  const [test, setTest] = useState<Test | null>(null);
  const [phase, setPhase] = useState<Phase>("start");

  // Identity comes from the signed-in student's profile — the start screen
  // never asks for name, group, or level.
  const takerName = user?.name?.trim() || "Anonymous";

  const [finalAnswers, setFinalAnswers] = useState<Answers>({});
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = getTest(id);
    if (!t) {
      router.replace("/tests");
      return;
    }
    setTest(t);
  }, [id, router]);

  // Completion is terminal. A direct URL or an old review link returns only the
  // saved score summary and never exposes the question set for a retake.
  useEffect(() => {
    if (!test) return;
    const me = takerName.trim().toLowerCase();
    const latest = attempts
      .filter(
        (a) => a.testId === test.id && a.takerName.trim().toLowerCase() === me,
      )
      .sort((a, b) => b.submittedAt - a.submittedAt)[0];
    if (latest) {
      setFinalAnswers(latest.answers);
      setTimedOut(!!latest.timedOut);
      setPhase("done");
    }
  }, [test, attempts, takerName]);

  if (!test) {
    return (
      <Card className="mx-auto max-w-md py-12 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
        <p className="text-sm text-slate-500">Loading test…</p>
      </Card>
    );
  }

  function handleSubmit(answers: Answers, meta: SubmitMeta) {
    const score = gradeTest(test!, answers);
    const total = maxScore(test!);
    saveAttempt({
      id: uid(),
      testId: test!.id,
      testTitle: test!.title,
      takerName,
      answers,
      score,
      maxScore: total,
      submittedAt: Date.now(),
      timeTakenSec: meta.timeTakenSec,
      timedOut: meta.timedOut || undefined,
      integrityViolations:
        meta.integrity.violations > 0 ? meta.integrity.violations : undefined,
      integrityFlags:
        meta.integrity.violations > 0 ? meta.integrity.flags : undefined,
    });
    void notifyTelegram(test!, takerName, score, total, "", "");
    setFinalAnswers(answers);
    setTimedOut(meta.timedOut);
    setPhase("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (phase === "done") {
    return (
      <Results
        test={test}
        answers={finalAnswers}
        name={takerName}
        timedOut={timedOut}
      />
    );
  }

  if (phase === "running") {
    return (
      <QuestionRunner
        test={test}
        mode="test"
        subtitle={bookOf(test)}
        timeLimitMin={test.durationMinutes}
        onSubmit={handleSubmit}
      />
    );
  }

  // ---- Start screen: test detail, not a duplicate "start" click ----
  //
  // This used to be a bare "Start test" button with no rules, immediately
  // followed by QuestionRunner's own SecureBriefing screen — two near-
  // identical gates in a row, the second of which repeats "single attempt",
  // repeats the question count, and is the one that actually matters (it's
  // the screen whose Begin button starts the clock and engages the proctor).
  // A student clicking through two "are you sure you want to start" screens
  // learns to click fast, not to read either of them.
  //
  // This screen now does something SecureBriefing doesn't: shows the test's
  // title/description and, since attempts here are one-shot (see the
  // terminal-completion effect above), makes that permanence explicit before
  // the student is even one click from the proctored briefing. SecureBriefing
  // remains the single pre-exam gate that covers fullscreen/tab/lock rules
  // and is the one whose click starts the timer.
  const timed = !!(test.durationMinutes && test.durationMinutes > 0);
  return (
    <Card className="mx-auto max-w-lg space-y-5 p-7">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {test.title}
        </h1>
        {test.description && <p className="mt-1 text-slate-600">{test.description}</p>}
        <p className="mt-2 text-sm text-slate-500">
          {test.questions.length} question{test.questions.length === 1 ? "" : "s"}
          {timed
            ? ` · Timed: ${test.durationMinutes} minute${
                test.durationMinutes === 1 ? "" : "s"
              } · auto-submits when time runs out`
            : " · Untimed"}
        </p>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
        This is a single-attempt test. Once you submit, you can't retake it or
        review the questions again — your teacher keeps the detailed record.
      </p>

      <Button onClick={() => setPhase("running")} className="w-full justify-center">
        Continue to secure test
      </Button>
    </Card>
  );
}

function Results({
  test,
  answers,
  name,
  timedOut,
}: {
  test: Test;
  answers: Answers;
  name: string;
  timedOut?: boolean;
}) {
  const score = gradeTest(test, answers);
  const total = maxScore(test);

  return (
    <div className="space-y-6">
      <ExamResult
        heading={`Results for ${name}`}
        scoreEarned={score}
        scoreTotal={total}
        cause={timedOut ? "timeout" : "manual"}
        primaryHref="/results"
        primaryLabel="View all results"
      />
      <p className="text-center text-sm text-slate-500">
        Your detailed answers remain with your teacher. Use Practice or Books
        to work on the same skill again.
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/tests"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to tests
        </Link>
      </div>
    </div>
  );
}
