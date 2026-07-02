"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, LinkButton, inputClass } from "@/components/ui";
import { gradeQuestion, getTest } from "@/lib/store";
import type { Question, Test } from "@/lib/types";

/** Human-readable rendering of a set of answer ids for a question. */
function label(q: Question, ids: string[]): string {
  if (q.type === "short") return ids.filter(Boolean).join(", ") || "—";
  if (q.type === "boolean")
    return ids[0] === "false" ? "False" : ids[0] === "true" ? "True" : "—";
  const texts = ids
    .map((id) => q.choices.find((c) => c.id === id)?.text)
    .filter(Boolean);
  return texts.length ? texts.join(", ") : "—";
}

type Verdict = "correct" | "incorrect";

export default function PracticeRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<Test | null>(null);

  useEffect(() => {
    const t = getTest(id);
    if (!t || t.questions.length === 0) {
      router.replace("/practice");
      return;
    }
    setTest(t);
  }, [id, router]);

  if (!test) return <p className="text-slate-500">Loading…</p>;
  return <Runner test={test} />;
}

function Runner({ test }: { test: Test }) {
  const total = test.questions.length;

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  // qid -> whether it was answered correctly on this run
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [done, setDone] = useState(false);

  const q = test.questions[index];
  const answered = answer.length > 0 && answer.some((a) => a.trim() !== "");
  const verdict: Verdict | null = checked
    ? gradeQuestion(q, answer) === q.points
      ? "correct"
      : "incorrect"
    : null;

  const correctCount = useMemo(
    () => Object.values(verdicts).filter((v) => v === "correct").length,
    [verdicts],
  );

  function check() {
    if (!answered) return;
    const isCorrect = gradeQuestion(q, answer) === q.points;
    setVerdicts((prev) => ({ ...prev, [q.id]: isCorrect ? "correct" : "incorrect" }));
    setChecked(true);
  }

  function retry() {
    setAnswer([]);
    setChecked(false);
    setVerdicts((prev) => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });
  }

  function next() {
    if (index + 1 >= total) {
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setIndex((i) => i + 1);
    setAnswer([]);
    setChecked(false);
  }

  function restart() {
    setIndex(0);
    setAnswer([]);
    setChecked(false);
    setVerdicts({});
    setDone(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    const answeredCount = Object.keys(verdicts).length;
    const pct =
      answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    return (
      <div className="space-y-6">
        <Card className="space-y-2 text-center">
          <p className="text-sm text-slate-500">Practice complete · {test.title}</p>
          <h1 className="text-4xl font-bold">
            {correctCount} / {answeredCount}
          </h1>
          <p
            className={`text-lg font-semibold ${
              pct >= 50 ? "text-green-600" : "text-amber-600"
            }`}
          >
            {pct}% correct
          </p>
          <p className="text-sm text-slate-500">
            Practice runs are not saved or graded.
          </p>
        </Card>

        <div className="space-y-2">
          {test.questions.map((question, i) => {
            const v = verdicts[question.id];
            return (
              <Card key={question.id} className="flex items-center justify-between gap-4">
                <span className="text-sm">
                  <span className="mr-2 text-slate-400">Q{i + 1}.</span>
                  {question.prompt}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    v === "correct"
                      ? "text-green-600"
                      : v === "incorrect"
                        ? "text-red-600"
                        : "text-slate-400"
                  }`}
                >
                  {v === "correct" ? "✓" : v === "incorrect" ? "✗" : "—"}
                </span>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button onClick={restart}>Practise again</Button>
          <LinkButton href="/practice" variant="secondary">
            Back to practice
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{test.title}</h1>
          <p className="text-sm text-slate-500">Practice mode</p>
        </div>
        <span className="shrink-0 text-sm text-slate-500">
          {correctCount} correct
        </span>
      </div>

      {/* Progress */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>
            Question {index + 1} of {total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <Card className="space-y-4">
        <h3 className="font-medium">
          <span className="mr-2 text-slate-400">Q{index + 1}.</span>
          {q.prompt}
        </h3>

        <QuestionInput
          question={q}
          value={answer}
          disabled={checked}
          onChange={setAnswer}
        />

        {verdict && (
          <div
            className={`rounded-md border p-3 text-sm ${
              verdict === "correct"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <p className="font-semibold">
              {verdict === "correct" ? "✓ Correct!" : "✗ Not quite."}
            </p>
            {verdict === "incorrect" && (
              <p className="mt-1">
                Correct answer: {label(q, q.correct)}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="flex items-center justify-between gap-3">
        {!checked ? (
          <>
            <span className="text-sm text-slate-500">
              Choose your answer, then check it.
            </span>
            <Button onClick={check} disabled={!answered}>
              Check answer
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={retry}>
              Try again
            </Button>
            <Button onClick={next}>
              {index + 1 >= total ? "Finish" : "Next question →"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  disabled,
  onChange,
}: {
  question: Question;
  value: string[];
  disabled: boolean;
  onChange: (v: string[]) => void;
}) {
  const q = question;

  if (q.type === "single" || q.type === "boolean") {
    const options =
      q.type === "boolean"
        ? [
            { id: "true", text: "True" },
            { id: "false", text: "False" },
          ]
        : q.choices;
    return (
      <div className="space-y-2">
        {options.map((c) => (
          <label
            key={c.id}
            className={`flex items-center gap-2 text-sm ${
              disabled ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <input
              type="radio"
              name={q.id}
              disabled={disabled}
              checked={value[0] === c.id}
              onChange={() => onChange([c.id])}
            />
            {c.text}
          </label>
        ))}
      </div>
    );
  }

  if (q.type === "multiple") {
    return (
      <div className="space-y-2">
        {q.choices.map((c) => (
          <label
            key={c.id}
            className={`flex items-center gap-2 text-sm ${
              disabled ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.includes(c.id)}
              onChange={() =>
                onChange(
                  value.includes(c.id)
                    ? value.filter((id) => id !== c.id)
                    : [...value, c.id],
                )
              }
            />
            {c.text}
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      className={inputClass}
      value={value[0] ?? ""}
      disabled={disabled}
      onChange={(e) => onChange([e.target.value])}
      placeholder="Type your answer…"
    />
  );
}
