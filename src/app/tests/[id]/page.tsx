"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { QuestionRunner, type SubmitMeta } from "@/components/QuestionRunner";
import {
  bookOf,
  gradeQuestion,
  gradeTest,
  getTest,
  maxScore,
  saveAttempt,
  uid,
  useAttempts,
} from "@/lib/store";
import { type Question, type Test } from "@/lib/types";
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
  const searchParams = useSearchParams();
  const wantReview = searchParams.get("review") === "1";
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

  // Review mode (?review=1): jump straight to the graded breakdown of the
  // student's most recent attempt at this test. Read-only — never re-saves.
  useEffect(() => {
    if (!test || !wantReview) return;
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
  }, [test, wantReview, attempts, takerName]);

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
        reviewing={wantReview}
        onRetake={() => {
          router.replace(`/tests/${test.id}`);
          setPhase("running");
        }}
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

  // ---- Start screen: identity + test summary ----
  const timed = !!(test.durationMinutes && test.durationMinutes > 0);
  return (
    <div className="space-y-6">
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

      <Button onClick={() => setPhase("running")}>Start test</Button>
    </div>
  );
}

function Results({
  test,
  answers,
  name,
  timedOut,
  reviewing = false,
  onRetake,
}: {
  test: Test;
  answers: Answers;
  name: string;
  timedOut?: boolean;
  reviewing?: boolean;
  onRetake?: () => void;
}) {
  const score = gradeTest(test, answers);
  const total = maxScore(test);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  function label(q: Question, ids: string[]): string {
    if (q.type === "short" || q.type === "gap") return ids[0] || "—";
    if (q.type === "boolean")
      return ids[0] === "false" ? "False" : ids[0] === "true" ? "True" : "—";
    const texts = ids
      .map((id) => q.choices.find((c) => c.id === id)?.text)
      .filter(Boolean);
    return texts.length ? texts.join(", ") : "—";
  }

  return (
    <div className="space-y-6">
      {timedOut && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Time ran out — your test was submitted automatically with the answers you
          had so far.
        </div>
      )}
      <Card className="space-y-2 text-center">
        <p className="text-sm text-slate-500">
          {reviewing ? "Reviewing your last attempt" : `Results for ${name}`}
        </p>
        <h1 className="text-4xl font-bold tabular-nums">
          {score} / {total}
        </h1>
        <p
          className="text-lg font-semibold tabular-nums"
          style={{ color: pct >= 50 ? "#3F8F5F" : "#C1473A" }}
        >
          {pct}%
        </p>
      </Card>

      <div className="space-y-3">
        {test.questions.map((q, i) => {
          const earned = gradeQuestion(q, answers[q.id]);
          const correct = earned === q.points;
          return (
            <Card key={q.id} className="space-y-1">
              <div className="flex justify-between gap-4">
                <h3 className="font-medium">
                  <span className="mr-2 text-slate-400">Q{i + 1}.</span>
                  {q.prompt}
                </h3>
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums"
                  style={{ color: correct ? "#3F8F5F" : "#C1473A" }}
                >
                  {correct ? "✓" : "✗"} {earned}/{q.points}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                Your answer: {label(q, answers[q.id] ?? [])}
              </p>
              {!correct && (
                <p className="text-sm" style={{ color: "#3F8F5F" }}>
                  Correct: {label(q, q.correct)}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/tests"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to tests
        </Link>
        {reviewing && onRetake && (
          <button
            type="button"
            onClick={onRetake}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Retake test
          </button>
        )}
        <Link
          href="/results"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          View all results
        </Link>
      </div>
    </div>
  );
}
