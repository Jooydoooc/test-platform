"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, LinkButton } from "@/components/ui";
import { getTest, maxScore, saveTest, uid } from "@/lib/store";
import type { Question, QuestionType, Test } from "@/lib/types";

const TYPE_LABELS: Record<QuestionType, string> = {
  single: "Single choice",
  multiple: "Multiple choice",
  boolean: "True / False",
  short: "Short answer",
  gap: "Gap-fill",
};

// Scoped DESIGN_STYLE tokens (near-white / navy / gold). Applied here only
// until the palette + Sora/Plex fonts are wired globally.
const card = "rounded-xl border border-[#E3E1DB] bg-white";
const input =
  "w-full rounded-lg border border-[#E3E1DB] bg-white px-3 py-2.5 text-base text-[#1B2130] outline-none transition-colors placeholder:text-[#9c988e] focus:border-[#E3A82B] focus:ring-2 focus:ring-[#E3A82B]/25 sm:py-2 sm:text-sm";
const num = "font-mono tabular-nums";

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

// Deep-clone a question with fresh ids so a duplicate is fully independent.
function cloneQuestion(q: Question): Question {
  const idMap = new Map(q.choices.map((c) => [c.id, uid()]));
  return {
    ...q,
    id: uid(),
    choices: q.choices.map((c) => ({ id: idMap.get(c.id)!, text: c.text })),
    correct: q.correct.map((cid) => idMap.get(cid) ?? cid),
  };
}

function previewText(q: Question) {
  const t = q.prompt.trim();
  if (!t) return "Untitled question";
  return t.length > 64 ? `${t.slice(0, 64)}…` : t;
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
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = getTest(id);
    if (!t) {
      router.replace("/author");
      return;
    }
    setTest(t);
  }, [id, router]);

  if (!test) return <p className="text-[#6b6a63]">Loading…</p>;

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
    const q = newQuestion(type);
    update({ questions: [...test!.questions, q] });
    setOpenIds((prev) => new Set(prev).add(q.id)); // new questions open for editing
  }

  function duplicateQuestion(qid: string) {
    const src = test!.questions.find((q) => q.id === qid);
    if (!src) return;
    const copy = cloneQuestion(src);
    const i = test!.questions.findIndex((q) => q.id === qid);
    const next = [...test!.questions];
    next.splice(i + 1, 0, copy);
    update({ questions: next });
    setOpenIds((prev) => new Set(prev).add(copy.id));
  }

  function removeQuestion(qid: string) {
    update({ questions: test!.questions.filter((q) => q.id !== qid) });
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= test!.questions.length) return;
    const next = [...test!.questions];
    [next[index], next[to]] = [next[to], next[index]];
    update({ questions: next });
  }

  function toggleOpen(qid: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  function save() {
    saveTest(test!);
    setSaved(true);
  }

  const total = maxScore(test);
  const count = test.questions.length;

  return (
    <div className="space-y-6 text-[#1B2130]">
      <div className="flex items-center justify-between gap-3">
        <LinkButton href="/author" variant="secondary">
          <ArrowLeftIcon /> Back
        </LinkButton>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-[#3F8F5F]">
              <CheckIcon /> Saved
            </span>
          )}
          <button
            onClick={save}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#1B2130] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2b3346] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A82B] sm:min-h-0"
          >
            Save test
          </button>
        </div>
      </div>

      {/* Test meta */}
      <div className={`${card} space-y-4 p-5`}>
        <Field label="Title">
          <input
            className={input}
            value={test.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <textarea
            className={input}
            rows={2}
            value={test.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </Field>
        <Field label="Time limit (minutes)">
          <input
            type="number"
            min={0}
            className={`${input} ${num} w-32`}
            value={test.durationMinutes ?? ""}
            onChange={(e) => {
              const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
              update({ durationMinutes: n > 0 ? n : undefined });
            }}
            placeholder="Untimed"
          />
          <span className="mt-1 block text-xs text-[#6b6a63]">
            Leave blank or 0 for an untimed test. When set, the test
            auto-submits when time runs out.
          </span>
        </Field>
      </div>

      {/* Questions header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-[#1B2130]">
          Questions{" "}
          <span className={`${num} text-[#6b6a63]`}>({count})</span>
        </h2>
        <span className={`${num} text-sm text-[#6b6a63]`}>
          {total} point{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* Collapsible question list */}
      {count === 0 ? (
        <div className={`${card} p-6 text-sm text-[#6b6a63]`}>
          No questions yet. Add one below.
        </div>
      ) : (
        <ul className="space-y-2">
          {test.questions.map((q, i) => (
            <li key={q.id} className={`${card} overflow-hidden`}>
              <QuestionRow
                index={i}
                count={count}
                question={q}
                open={openIds.has(q.id)}
                onToggle={() => toggleOpen(q.id)}
                onMoveUp={() => moveQuestion(i, -1)}
                onMoveDown={() => moveQuestion(i, 1)}
                onDuplicate={() => duplicateQuestion(q.id)}
                onRemove={() => removeQuestion(q.id)}
                onChange={(patch) => updateQuestion(q.id, patch)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Add a question */}
      <div className={`${card} space-y-3 p-5`}>
        <h3 className="text-sm font-semibold text-[#1B2130]">Add a question</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
            <button
              key={type}
              onClick={() => addQuestion(type)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#E3E1DB] bg-white px-3 py-2 text-sm font-medium text-[#1B2130] transition-colors hover:border-[#E3A82B] hover:bg-[#fbf6ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A82B] sm:min-h-0"
            >
              <PlusIcon /> {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionRow({
  index,
  count,
  question,
  open,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onChange,
}: {
  index: number;
  count: number;
  question: Question;
  open: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<Question>) => void;
}) {
  const q = question;
  const bodyId = `q-${q.id}-body`;

  return (
    <>
      {/* Summary row */}
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A82B] focus-visible:ring-inset"
        >
          <Chevron open={open} />
          <span
            className={`${num} shrink-0 text-sm font-semibold text-[#1B2130]`}
          >
            Q{index + 1}
          </span>
          <span className="shrink-0 rounded-full border border-[#E3E1DB] bg-[#FAFAF8] px-2 py-0.5 text-xs font-medium text-[#6b6a63]">
            {TYPE_LABELS[q.type]}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              q.prompt.trim() ? "text-[#1B2130]" : "text-[#9c988e]"
            }`}
          >
            {previewText(q)}
          </span>
          <span className={`${num} shrink-0 text-xs text-[#6b6a63]`}>
            {q.points} pt{q.points === 1 ? "" : "s"}
          </span>
        </button>

        {/* Row actions (siblings of the toggle, not nested) */}
        <div className="flex shrink-0 items-center">
          <IconButton
            label="Move up"
            onClick={onMoveUp}
            disabled={index === 0}
          >
            <ArrowUpIcon />
          </IconButton>
          <IconButton
            label="Move down"
            onClick={onMoveDown}
            disabled={index === count - 1}
          >
            <ArrowDownIcon />
          </IconButton>
          <IconButton label="Duplicate" onClick={onDuplicate}>
            <CopyIcon />
          </IconButton>
          <IconButton label="Remove" tone="danger" onClick={onRemove}>
            <TrashIcon />
          </IconButton>
        </div>
      </div>

      {/* Expanded editor */}
      {open && (
        <div
          id={bodyId}
          className="space-y-4 border-t border-[#E3E1DB] px-3 py-4"
        >
          <QuestionBody question={q} onChange={onChange} />
        </div>
      )}
    </>
  );
}

function QuestionBody({
  question,
  onChange,
}: {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
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
    <>
      <Field label="Prompt">
        <textarea
          className={input}
          rows={2}
          value={q.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder={
            q.type === "gap"
              ? "Mark the blank with underscores, e.g. She ___ to school."
              : "Type the question…"
          }
        />
        {q.type === "gap" && (
          <span className="mt-1 block text-xs text-[#6b6a63]">
            Mark the blank with two or more underscores (___). The student types
            the missing word.
          </span>
        )}
      </Field>

      {(q.type === "single" || q.type === "multiple") && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-[#1B2130]">
            Choices{" "}
            <span className="font-normal text-[#9c988e]">
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
                className="h-4 w-4 shrink-0 accent-[#E3A82B]"
              />
              <input
                className={input}
                value={c.text}
                onChange={(e) => setChoiceText(c.id, e.target.value)}
                placeholder="Choice text"
              />
              <IconButton
                label="Remove choice"
                onClick={() => removeChoice(c.id)}
                disabled={q.choices.length <= 2}
              >
                <CloseIcon />
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            onClick={addChoice}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E1DB] bg-white px-3 py-1.5 text-sm font-medium text-[#1B2130] transition-colors hover:border-[#E3A82B] hover:bg-[#fbf6ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A82B]"
          >
            <PlusIcon /> Add choice
          </button>
        </div>
      )}

      {q.type === "boolean" && (
        <Field label="Correct answer">
          <select
            className={`${input} w-40`}
            value={q.correct[0] ?? "true"}
            onChange={(e) => onChange({ correct: [e.target.value] })}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </Field>
      )}

      {(q.type === "short" || q.type === "gap") && (
        <Field label="Accepted answers (one per line, case-insensitive)">
          <textarea
            className={input}
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
          className={`${input} ${num} w-24`}
          value={q.points}
          onChange={(e) =>
            onChange({ points: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </Field>
    </>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  tone = "neutral",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
}) {
  const hover =
    tone === "danger"
      ? "hover:bg-[#f7e9e7] hover:text-[#C1473A]"
      : "hover:bg-[#FAFAF8] hover:text-[#1B2130]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6b6a63] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E3A82B] disabled:pointer-events-none disabled:opacity-30 ${hover}`}
    >
      {children}
    </button>
  );
}

/* --- Line icons: single 1.75 stroke weight, currentColor, no fills --- */

const svg = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      {...svg}
      className={`shrink-0 text-[#6b6a63] transition-transform duration-150 ${
        open ? "rotate-90" : ""
      }`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...svg} width={16} height={16}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg {...svg} width={16} height={16}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg {...svg}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg {...svg}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg {...svg}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...svg}>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...svg} width={16} height={16}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...svg} width={16} height={16}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
