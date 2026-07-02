"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, inputClass, LinkButton } from "@/components/ui";
import { getTest, maxScore, saveTest, uid } from "@/lib/store";
import type { Question, QuestionType, Test } from "@/lib/types";

const TYPE_LABELS: Record<QuestionType, string> = {
  single: "Single choice",
  multiple: "Multiple choice",
  boolean: "True / False",
  short: "Short answer",
};

function newQuestion(type: QuestionType): Question {
  const base = { id: uid(), prompt: "", points: 1, correct: [] as string[] };
  if (type === "single" || type === "multiple") {
    return {
      ...base,
      type,
      choices: [
        { id: uid(), text: "" },
        { id: uid(), text: "" },
      ],
    };
  }
  if (type === "boolean") {
    return { ...base, type, choices: [], correct: ["true"] };
  }
  return { ...base, type, choices: [] };
}

export default function EditTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<Test | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = getTest(id);
    if (!t) {
      router.replace("/author");
      return;
    }
    setTest(t);
  }, [id, router]);

  if (!test) return <p className="text-slate-500">Loading…</p>;

  function update(patch: Partial<Test>) {
    setTest((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  }

  function updateQuestion(qid: string, patch: Partial<Question>) {
    update({
      questions: test!.questions.map((q) =>
        q.id === qid ? ({ ...q, ...patch } as Question) : q,
      ),
    });
  }

  function addQuestion(type: QuestionType) {
    update({ questions: [...test!.questions, newQuestion(type)] });
  }

  function removeQuestion(qid: string) {
    update({ questions: test!.questions.filter((q) => q.id !== qid) });
  }

  function save() {
    saveTest(test!);
    setSaved(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <LinkButton href="/author" variant="secondary">
          ← Back
        </LinkButton>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Saved ✓</span>}
          <span className="text-sm text-slate-500">
            {maxScore(test)} point{maxScore(test) === 1 ? "" : "s"}
          </span>
          <Button onClick={save}>Save test</Button>
        </div>
      </div>

      <Card className="space-y-4">
        <Field label="Title">
          <input
            className={inputClass}
            value={test.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <textarea
            className={inputClass}
            rows={2}
            value={test.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </Field>
        <Field label="Time limit (minutes)">
          <input
            type="number"
            min={0}
            className={`${inputClass} w-32`}
            value={test.durationMinutes ?? ""}
            onChange={(e) => {
              const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
              update({ durationMinutes: n > 0 ? n : undefined });
            }}
            placeholder="Untimed"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Leave blank or 0 for an untimed test. When set, the test auto-submits
            when time runs out.
          </span>
        </Field>
      </Card>

      <div className="space-y-4">
        {test.questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            index={i}
            question={q}
            onChange={(patch) => updateQuestion(q.id, patch)}
            onRemove={() => removeQuestion(q.id)}
          />
        ))}
      </div>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Add a question
        </h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
            <Button
              key={type}
              variant="secondary"
              onClick={() => addQuestion(type)}
            >
              + {TYPE_LABELS[type]}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function QuestionEditor({
  index,
  question,
  onChange,
  onRemove,
}: {
  index: number;
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onRemove: () => void;
}) {
  const q = question;

  function setChoiceText(cid: string, text: string) {
    onChange({
      choices: q.choices.map((c) => (c.id === cid ? { ...c, text } : c)),
    });
  }

  function addChoice() {
    onChange({ choices: [...q.choices, { id: uid(), text: "" }] });
  }

  function removeChoice(cid: string) {
    onChange({
      choices: q.choices.filter((c) => c.id !== cid),
      correct: q.correct.filter((id) => id !== cid),
    });
  }

  function toggleCorrect(cid: string) {
    if (q.type === "single") {
      onChange({ correct: [cid] });
    } else {
      const has = q.correct.includes(cid);
      onChange({
        correct: has
          ? q.correct.filter((id) => id !== cid)
          : [...q.correct, cid],
      });
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            Q{index + 1}
          </span>
          <span className="text-slate-500">{TYPE_LABELS[q.type]}</span>
        </div>
        <Button variant="danger" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <Field label="Prompt">
        <textarea
          className={inputClass}
          rows={2}
          value={q.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="Type the question…"
        />
      </Field>

      {(q.type === "single" || q.type === "multiple") && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-700">
            Choices{" "}
            <span className="font-normal text-slate-400">
              (check the correct one{q.type === "multiple" ? "(s)" : ""})
            </span>
          </span>
          {q.choices.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                type={q.type === "single" ? "radio" : "checkbox"}
                checked={q.correct.includes(c.id)}
                onChange={() => toggleCorrect(c.id)}
                aria-label="Mark correct"
              />
              <input
                className={inputClass}
                value={c.text}
                onChange={(e) => setChoiceText(c.id, e.target.value)}
                placeholder="Choice text"
              />
              <Button
                variant="secondary"
                onClick={() => removeChoice(c.id)}
                disabled={q.choices.length <= 2}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={addChoice}>
            + Add choice
          </Button>
        </div>
      )}

      {q.type === "boolean" && (
        <Field label="Correct answer">
          <select
            className={inputClass}
            value={q.correct[0] ?? "true"}
            onChange={(e) => onChange({ correct: [e.target.value] })}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </Field>
      )}

      {q.type === "short" && (
        <Field label="Accepted answers (one per line, case-insensitive)">
          <textarea
            className={inputClass}
            rows={2}
            value={q.correct.join("\n")}
            onChange={(e) =>
              onChange({
                correct: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder={"carbon dioxide\nCO2"}
          />
        </Field>
      )}

      <Field label="Points">
        <input
          type="number"
          min={1}
          className={`${inputClass} w-24`}
          value={q.points}
          onChange={(e) =>
            onChange({ points: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </Field>
    </Card>
  );
}
