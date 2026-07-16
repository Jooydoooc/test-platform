"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, LinkButton, inputClass } from "@/components/ui";
import { getTest, maxScore, saveTest, uid } from "@/lib/store";
import type { Question, QuestionType, Test } from "@/lib/types";
import { parseQuestions } from "@/lib/author/parse-questions";
import {
  isQuestionValid,
  validateQuestion,
  validateTest,
} from "@/lib/author/validate-question";
import { publishAuthoredTest } from "@/lib/data/publish-test";
import type { SkillArea } from "@/lib/database.types";

// Skills a test can be published under (valid for both test_skill_scope and
// skill_area). WRITING/SPEAKING are skill_area-only, so not offered here.
const PUBLISH_SKILLS: { value: SkillArea; label: string }[] = [
  { value: "GRAMMAR", label: "Grammar" },
  { value: "VOCABULARY", label: "Vocabulary" },
  { value: "READING", label: "Reading" },
  { value: "LISTENING", label: "Listening" },
];

const TYPE_LABELS: Record<QuestionType, string> = {
  single: "Single choice",
  multiple: "Multiple choice",
  boolean: "True / False",
  short: "Short answer",
  gap: "Gap-fill",
};

// Aligned to the app design system (indigo brand + slate neutrals). Card mirrors
// components/ui.tsx Card; input reuses the shared inputClass so the editor stays
// in lockstep with the rest of the product.
const card = "rounded-xl border border-slate-200/80 bg-white shadow-card";
const input = inputClass;
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

// Correct-answer summary for paste preview
function correctSummary(q: Question): string {
  if (q.type === "boolean") return q.correct[0] ?? "—";
  if (q.type === "single" || q.type === "multiple") {
    const texts = q.choices
      .filter((c) => q.correct.includes(c.id))
      .map((c) => (c.text.length > 24 ? c.text.slice(0, 24) + "…" : c.text));
    return texts.length ? texts.join(", ") : "—";
  }
  // short / gap
  return q.correct.slice(0, 2).join(" / ") || "—";
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

  // Paste panel state
  const [pasteText, setPasteText] = useState("");
  const [pasteConfirm, setPasteConfirm] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Undo-on-remove: stash the last deleted question so a misclick is recoverable.
  const [undo, setUndo] = useState<{ q: Question; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-to-reorder state (collapsed rows only).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const t = getTest(id);
    if (!t) {
      router.replace("/admin/tests");
      return;
    }
    setTest(t);
  }, [id, router]);

  // Debounced autosave: persist the draft shortly after the last edit so leaving
  // the page (Back, refresh, tab close) never loses work. Flips the Saved chip on.
  useEffect(() => {
    if (!test || saved) return;
    const t = setTimeout(() => {
      saveTest(test);
      setSaved(true);
    }, 800);
    return () => clearTimeout(t);
  }, [test, saved]);

  // Belt-and-suspenders for the sub-second window before autosave fires.
  useEffect(() => {
    if (saved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saved]);

  // Cmd/Ctrl+S saves the draft immediately (power-user accelerator).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (test) {
          saveTest(test);
          setSaved(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [test]);

  // Clear any pending undo timer on unmount.
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  if (!test) return <p className="text-slate-600">Loading…</p>;

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
    const index = test!.questions.findIndex((q) => q.id === qid);
    if (index < 0) return;
    const q = test!.questions[index];
    update({ questions: test!.questions.filter((qq) => qq.id !== qid) });
    setUndo({ q, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function undoRemove() {
    if (!undo) return;
    const next = [...test!.questions];
    next.splice(Math.min(undo.index, next.length), 0, undo.q);
    update({ questions: next });
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= test!.questions.length) return;
    const next = [...test!.questions];
    [next[index], next[to]] = [next[to], next[index]];
    update({ questions: next });
  }

  // Drag-to-reorder: move the dragged question to the drop position.
  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...test!.questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
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

  async function publish() {
    if (!test || publishing) return;
    setPublishError(null);
    const skill = test.skillArea;
    if (!skill) {
      setPublishError("Pick a skill before publishing.");
      return;
    }
    setPublishing(true);
    // Persist the draft locally first so the published snapshot matches what's
    // on screen, then push it to Supabase.
    saveTest(test);
    try {
      const res = await publishAuthoredTest(test, skill);
      if (!res.ok) {
        setPublishError(res.error);
        return;
      }
      // Record the published identity so a re-publish updates in place.
      const published = {
        ...test,
        supabaseTestId: res.testId,
        shareToken: res.shareToken,
      };
      setTest(published);
      saveTest(published);
      setSaved(true);
    } catch {
      setPublishError("Could not reach the server. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  const total = maxScore(test);
  const count = test.questions.length;

  // Readiness banner
  const readiness = validateTest(test.questions);
  const canPublish = readiness.ready && !!test.skillArea && !publishing;
  const shareUrl =
    test.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/t/${test.shareToken}`
      : null;

  return (
    <div className="space-y-6 text-slate-900">
      <div className="flex items-center justify-between gap-3">
        <LinkButton href="/admin/tests" variant="secondary">
          <ArrowLeftIcon /> Back
        </LinkButton>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckIcon /> Saved
            </span>
          )}
          {test.shareToken && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <CheckIcon /> Published
            </span>
          )}
          <button
            onClick={save}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:min-h-0"
          >
            Save draft
          </button>
          <button
            onClick={publish}
            disabled={!canPublish}
            title={
              !test.skillArea
                ? "Pick a skill first"
                : !readiness.ready
                  ? "Fix incomplete questions first"
                  : undefined
            }
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
          >
            {publishing
              ? "Publishing…"
              : test.shareToken
                ? "Update published test"
                : "Publish to students"}
          </button>
        </div>
      </div>

      {/* Publish error */}
      {publishError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{publishError}</span>
        </div>
      )}

      {/* Share link (after publishing) */}
      {shareUrl && (
        <div className={`${card} flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              Student link
            </p>
            <p className="truncate font-mono text-xs text-slate-600">{shareUrl}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <CopyIcon /> Copy link
            </button>
            <LinkButton href={shareUrl} variant="secondary">
              Open
            </LinkButton>
          </div>
        </div>
      )}

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
          <span className="mt-1 block text-xs text-slate-600">
            Leave blank or 0 for an untimed test. When set, the test
            auto-submits when time runs out.
          </span>
        </Field>
        <Field label="Skill">
          <div className="flex flex-wrap gap-2">
            {PUBLISH_SKILLS.map((s) => {
              const active = test.skillArea === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => update({ skillArea: s.value })}
                  className={`inline-flex min-h-[40px] items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:min-h-0 ${
                    active
                      ? "border-brand-500 bg-brand-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-400 hover:bg-brand-50"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <span className="mt-1 block text-xs text-slate-600">
            Required to publish. All questions in this test count toward this
            skill.
          </span>
        </Field>
      </div>

      {/* Questions header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Questions{" "}
          <span className={`${num} text-slate-600`}>({count})</span>
        </h2>
        <span className={`${num} text-sm text-slate-600`}>
          {total} point{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* Readiness banner */}
      {readiness.total > 0 && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
            readiness.ready
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {readiness.ready ? (
            <>
              <CheckIcon />
              <span>
                All {readiness.total} question{readiness.total === 1 ? "" : "s"} look good.
              </span>
            </>
          ) : (
            <>
              <AlertIcon />
              <span>
                {readiness.incomplete} of {readiness.total} question
                {readiness.total === 1 ? "" : "s"} need attention.
              </span>
            </>
          )}
        </div>
      )}

      {/* Collapsible question list */}
      {count === 0 ? (
        <div className={`${card} p-6 text-sm text-slate-600`}>
          No questions yet. Add one below.
        </div>
      ) : (
        <ul className="space-y-2">
          {test.questions.map((q, i) => {
            const collapsed = !openIds.has(q.id);
            const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
            return (
              <li
                key={q.id}
                draggable={collapsed}
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (dragIndex !== null) {
                    e.preventDefault();
                    setOverIndex(i);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) reorder(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`${card} overflow-hidden transition-shadow ${
                  isOver ? "ring-2 ring-brand-400" : ""
                } ${dragIndex === i ? "opacity-50" : ""}`}
              >
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
            );
          })}
        </ul>
      )}

      {/* Paste questions panel */}
      <PastePanel
        open={pasteOpen}
        onToggle={() => { setPasteOpen((v) => !v); setPasteConfirm(false); }}
        pasteText={pasteText}
        onTextChange={(v) => { setPasteText(v); setPasteConfirm(false); }}
        confirm={pasteConfirm}
        onAdd={(questions) => {
          update({ questions: [...test!.questions, ...questions] });
          setPasteText("");
          setPasteConfirm(true);
          setTimeout(() => setPasteConfirm(false), 3000);
        }}
        onClear={() => { setPasteText(""); setPasteConfirm(false); }}
      />

      {/* Add a question */}
      <div className={`${card} space-y-3 p-5`}>
        <h3 className="text-sm font-semibold text-slate-900">Add a question</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
            <button
              key={type}
              onClick={() => addQuestion(type)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:min-h-0"
            >
              <PlusIcon /> {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Undo toast after a question is removed */}
      {undo && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
        >
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-card-hover">
            <span>Question removed.</span>
            <button
              type="button"
              onClick={undoRemove}
              className="rounded font-semibold text-brand-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paste panel
// ---------------------------------------------------------------------------

function PastePanel({
  open,
  onToggle,
  pasteText,
  onTextChange,
  confirm,
  onAdd,
  onClear,
}: {
  open: boolean;
  onToggle: () => void;
  pasteText: string;
  onTextChange: (v: string) => void;
  confirm: boolean;
  onAdd: (questions: Question[]) => void;
  onClear: () => void;
}) {
  const parsed = useMemo(
    () => (pasteText.trim() ? parseQuestions(pasteText) : []),
    [pasteText],
  );
  const count = parsed.length;

  return (
    <div className={`${card} overflow-hidden`}>
      {/* Header / toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
      >
        <Chevron open={open} />
        <span className="flex-1 text-sm font-semibold text-slate-900">
          Paste questions
        </span>
        <span className="text-xs text-slate-500">Bulk import from text</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-200 px-5 py-4">
          {/* Format help */}
          <details className="group">
            <summary className="cursor-pointer select-none text-xs font-medium text-slate-600 hover:text-slate-900">
              Format help ▸
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">{`[SINGLE] What is the capital of France?
A) Berlin
B) Paris *
C) Madrid
D) Rome
Explanation: Paris has been the capital since 987.

[MULTIPLE] Which are prime numbers?
- 2 *
- 4
- 7 *
- 9

[TF] The Earth orbits the Sun.
Answer: True

[SHORT] What gas do plants absorb during photosynthesis?
Answer: carbon dioxide | CO2

[GAP] She ___ to school every morning.
Answer: goes
(2 pts)`}</pre>
            <p className="mt-2 text-xs text-slate-600">
              Separate questions with a blank line. Type tags are optional — the
              parser infers the type. Correct choices end with{" "}
              <code className="rounded bg-slate-100 px-1">*</code> or{" "}
              <code className="rounded bg-slate-100 px-1">(correct)</code>.
              Accepted answers for Short/Gap are split on{" "}
              <code className="rounded bg-slate-100 px-1">|</code>,{" "}
              <code className="rounded bg-slate-100 px-1">/</code>, or{" "}
              <code className="rounded bg-slate-100 px-1">,</code>.
            </p>
          </details>

          {/* Textarea */}
          <textarea
            className={`${input} resize-y`}
            rows={8}
            value={pasteText}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={`Paste your questions here, one block per question separated by blank lines…`}
          />

          {/* Live preview */}
          {count > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">
                {count} question{count === 1 ? "" : "s"} detected
              </p>
              <ul className="space-y-1.5">
                {parsed.map(({ question: q, warnings }, idx) => (
                  <li
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                        {TYPE_LABELS[q.type]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-900">
                        {q.prompt.trim() || (
                          <span className="text-slate-500">Untitled</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        → {correctSummary(q)}
                      </span>
                    </div>
                    {warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {warnings.map((w, wi) => (
                          <li
                            key={wi}
                            className="flex items-start gap-1 text-xs text-amber-700"
                          >
                            <AlertIcon className="mt-px h-3 w-3 shrink-0" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!pasteText.trim() && (
            <p className="text-xs text-slate-500">
              Questions will appear here as you type or paste.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={count === 0}
              onClick={() => onAdd(parsed.map((p) => p.question))}
              className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-40"
            >
              Add {count > 0 ? count : ""} question{count === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Clear
            </button>
            {confirm && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                <CheckIcon /> Added!
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question row + body
// ---------------------------------------------------------------------------

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
  const valid = isQuestionValid(q);
  const issues = valid ? [] : validateQuestion(q);

  return (
    <>
      {/* Summary row */}
      <div className="flex items-center gap-1 pr-2">
        {!open && (
          <span
            className="hidden shrink-0 cursor-grab pl-2 text-slate-300 sm:block"
            aria-hidden
            title="Drag to reorder"
          >
            <GripIcon />
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
        >
          <Chevron open={open} />
          <span
            className={`${num} shrink-0 text-sm font-semibold text-slate-900`}
          >
            Q{index + 1}
          </span>
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
            {TYPE_LABELS[q.type]}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              q.prompt.trim() ? "text-slate-900" : "text-slate-500"
            }`}
          >
            {previewText(q)}
          </span>
          <span className={`${num} shrink-0 text-xs text-slate-600`}>
            {q.points} pt{q.points === 1 ? "" : "s"}
          </span>
          {/* Validation status chip */}
          {!valid && (
            <span
              title={issues.join("\n")}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
            >
              <AlertIcon className="h-3 w-3" />
              Incomplete
            </span>
          )}
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
          className="space-y-4 border-t border-slate-200 px-3 py-4"
        >
          {/* Inline validation issues */}
          {issues.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-amber-700"
                >
                  <AlertIcon className="mt-px h-3.5 w-3.5 shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
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
          <span className="mt-1 block text-xs text-slate-600">
            Mark the blank with two or more underscores (___). The student types
            the missing word.
          </span>
        )}
      </Field>

      {(q.type === "single" || q.type === "multiple") && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-900">
            Choices{" "}
            <span className="font-normal text-slate-500">
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
                className="h-4 w-4 shrink-0 accent-brand-600"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
      ? "hover:bg-red-50 hover:text-red-600"
      : "hover:bg-slate-50 hover:text-slate-900";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-30 ${hover}`}
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
      className={`shrink-0 text-slate-600 transition-transform duration-150 ${
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

function GripIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
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

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
