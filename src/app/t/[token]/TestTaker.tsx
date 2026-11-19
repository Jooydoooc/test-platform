"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { getExistingAttempt, startAttempt } from "@/lib/data/attempts";
import { submitAttempt } from "@/lib/data/submit";
import {
  useProctor,
  FullscreenGuard,
  ProctorWarning,
  type Integrity,
} from "@/components/Proctor";
import type { Json, QuestionFormat } from "@/lib/database.types";
import { setLiveTest } from "@/lib/live-test";
import {
  ExamHeader,
  ExamResult,
  ConfirmSubmit,
  SecureBriefing,
  ProgressStrip,
} from "@/components/exam";

export interface TakerQuestion {
  id: string;
  format: QuestionFormat;
  prompt: string;
  content: Json;
}

type Choice = { id: string; text: string };

// Pull renderable choices from a question's content. Single/multi choice ship
// {choices:[{id,text}]}; true/false falls back to a fixed pair.
function choicesOf(q: TakerQuestion): Choice[] {
  const c = q.content as { choices?: unknown } | null;
  if (c && Array.isArray(c.choices)) {
    return c.choices.filter(
      (x): x is Choice =>
        !!x && typeof x === "object" && "id" in x && "text" in x,
    );
  }
  if (q.format === "TRUE_FALSE") {
    return [
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ];
  }
  return [];
}

const CHOICE_FORMATS: QuestionFormat[] = [
  "MULTIPLE_CHOICE_SINGLE",
  "MULTIPLE_CHOICE_MULTI",
  "TRUE_FALSE",
];

// "Answered" means a genuine answer, not merely a key present in `responses`.
// toggleChoiceMulti and setText always write a value — {selected: []} once a
// ticked checkbox is unticked, {text: ""} once typed text is deleted — so
// checking `responses[q.id] !== undefined` (the old test) stayed true after
// the student blanked their answer. That falsely opened the Next/Submit gate
// and inflated the pre-submit tally while the question would score zero. This
// is the single source of truth for "answered": both the gate and the
// confirm-dialog tally call it, so they can never disagree with each other.
function isAnswered(format: QuestionFormat, value: unknown): boolean {
  if (value == null || typeof value !== "object") return false;
  if (CHOICE_FORMATS.includes(format)) {
    const sel = (value as { selected?: unknown }).selected;
    return Array.isArray(sel) && sel.length > 0;
  }
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" && text.trim().length > 0;
}

type Phase = "loading" | "blocked" | "done" | "taking" | "submitting" | "finished";

export function TestTaker({
  testId,
  token,
  title,
  description,
  timeLimitSec,
  questions,
}: {
  testId: string;
  /** Share token from the URL — the key that unlocks the attempt (0025). */
  token: string;
  title: string;
  description: string;
  timeLimitSec: number | null;
  questions: TakerQuestion[];
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  // Teacher/admin viewing this link, not taking it — no attempt row exists.
  // Set only from getExistingAttempt()'s return value (server-derived role
  // via getServerUser(), see attempts.ts), never from a prop or client-side
  // session read, so a student has no way to set this themselves.
  const [preview, setPreview] = useState(false);
  const [resultId, setResultId] = useState<string | undefined>();
  const [expAwarded, setExpAwarded] = useState(0);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Secure-mode gate: the exam only reveals its questions after the student
  // clicks "Begin" (which enters fullscreen — fullscreen needs a user gesture).
  const [secureStarted, setSecureStarted] = useState(false);
  // Final graded score, once submitted. pendingReview means written answers
  // still need the teacher, so no definitive percentage is shown yet.
  const [score, setScore] = useState<{ earned: number; total: number } | null>(
    null,
  );
  const [pendingReview, setPendingReview] = useState(false);
  // Why the attempt was submitted, so the result screen can explain an
  // automatic submit instead of showing a bare "Test submitted".
  const [submitCause, setSubmitCause] = useState<"manual" | "timeout" | "left">(
    "manual",
  );

  // ONE-WAY navigation: index only ever advances via Next (or, in preview,
  // via the previewer's own Next click — see below). There is no Previous
  // button and no palette to jump backward with, so under normal operation
  // `index` and `highWaterMark` move in lockstep and index is never less
  // than highWaterMark.
  //
  // highWaterMark exists anyway, as its own piece of state, rather than
  // deriving the lock purely from "is this the current question": that
  // would just be hiding the Previous control, which the task explicitly
  // rejects as an implementation. With a real high-water mark, the answer
  // controls for the current question are disabled whenever `index` is
  // somehow behind it — a defense-in-depth guard against any future code
  // path (a bug, a future feature) that moves `index` backward without
  // meaning to re-open an already-locked question. It composes with
  // `locked = submitting` below: both conditions feed the same `locked`
  // value the ChoiceList/textarea already know how to freeze.
  const [index, setIndex] = useState(0);
  const [highWaterMark, setHighWaterMark] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Where keyboard/screen-reader focus lands whenever the student returns to
  // the question view — from an ordinary palette jump / Previous / Next.
  // Without this, focus falls back to document.body on every navigation,
  // which is silent and disorienting for keyboard and screen-reader users.
  // There is no review screen to return focus from any more: "Finish test"
  // opens ConfirmSubmit directly over this same question, so the question
  // never leaves the screen and this effect never needs to re-fire for it.
  const promptRef = useRef<HTMLParagraphElement>(null);
  // secureStarted belongs in the deps: the prompt does not exist behind the
  // briefing screen, so without it the first run finds no target and focus
  // stays on the body for the whole first question.
  useEffect(() => {
    promptRef.current?.focus();
  }, [index, secureStarted]);

  const submittingRef = useRef(false);
  // The proctor is engaged after finishSubmit is defined; finishSubmit reads the
  // tally through this ref to avoid a definition cycle with useProctor.
  const getIntegrityRef = useRef<() => Integrity>(() => ({
    violations: 0,
    flags: {},
  }));

  const finishSubmit = useCallback(async (
    cause: "manual" | "timeout" | "left" = "manual",
  ) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Clear any error from a previous failed attempt: leaving it up makes a
    // retry look like it already failed, and re-setting the identical string
    // into role="alert" produces no content change, so a second identical
    // failure would never be announced.
    setError(null);
    setSubmitCause(cause);
    setPhase("submitting");
    const res = await submitAttempt(
      testId,
      responses,
      getIntegrityRef.current(),
    );
    if (!res.ok) {
      setError(res.error ?? "Could not submit.");
      setPhase("taking");
      submittingRef.current = false;
      return;
    }
    setResultId(res.resultId);
    setExpAwarded(res.expAwarded ?? 0);
    setNewBadges(res.newBadges ?? []);
    setPendingReview(res.pendingReview ?? false);
    setScore(
      res.scoreTotal != null && res.scoreEarned != null
        ? { earned: res.scoreEarned, total: res.scoreTotal }
        : null,
    );
    setPhase("finished");
  }, [testId, responses]);

  // Proctor (strict lockdown). The first tab/app switch warns and the second
  // submits. getIntegrity feeds the teacher-facing integrity payload.
  // Never armed in preview — there is no attempt to submit and no student to
  // protect the integrity of, matching the hosted rail's previewMode which
  // never engages its lockdown either.
  const proctor = useProctor({
    enabled: !preview && (phase === "taking" || phase === "submitting"),
    onAutoSubmit: () => finishSubmit("left"),
  });
  getIntegrityRef.current = proctor.getIntegrity;

  // Release the lockdown (and exit fullscreen) once the exam is over.
  useEffect(() => {
    if (phase === "finished" || phase === "done" || phase === "blocked") {
      proctor.disengage();
    }
  }, [phase, proctor]);

  // Global chrome (header/back button) hides only while a real student is
  // actively sitting the exam — not on the loading/blocked/done/finished
  // screens, and never in teacher/admin preview, which keeps normal
  // navigation. The cleanup unconditionally resets to false so unmounting,
  // navigating away, or hitting browser-back mid-exam can never leave the
  // chrome stuck hidden.
  //
  // secureStarted matters as much as the phase here: the briefing screen
  // renders under phase "taking" but before the student has begun, and it is
  // the one screen where they still legitimately need a way out. The exam
  // proper starts where the timer does (see the countdown effect below).
  useEffect(() => {
    const live =
      !preview && secureStarted && (phase === "taking" || phase === "submitting");
    setLiveTest(live);
    return () => setLiveTest(false);
  }, [preview, secureStarted, phase]);

  // Read-only mount check: does an attempt already exist? This creates
  // NOTHING (no RPC, no insert) — it only tells the briefing screen which of
  // four states it's in:
  //   * already submitted -> skip the briefing, show "done" immediately
  //   * teacher/admin     -> preview: skip the briefing, render read-only
  //   * in-progress       -> resume: anchor the deadline to that attempt's
  //                          real started_at (server time, never reset) so
  //                          the clock is truthful, then let the student
  //                          click Begin to re-enter
  //   * none              -> show the briefing with NO running countdown;
  //                          startAttempt (and the real clock) only fires
  //                          from beginSecure, once the student clicks Begin
  //
  // Reading rather than creating here is the whole point: a render must never
  // anchor a student's exam clock. The server component's 0032 gate already
  // made the same move for the same reason, and Next.js can render a dynamic
  // route speculatively.
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await getExistingAttempt(testId);
      if (!active) return;
      if (!res.ok) {
        setError(res.error ?? "Could not load the test.");
        setPhase("blocked");
        return;
      }
      if (res.alreadyCompleted) {
        setResultId(res.resultId);
        setPhase("done");
        return;
      }
      if (res.preview) {
        // Teacher/admin preview: no attempt, no deadline (the timer effect
        // below no-ops when deadline is null), and skip straight past the
        // secure-start briefing — that screen exists to get informed consent
        // for fullscreen + lockdown before a student's one shot at the exam
        // clock starts, none of which applies to someone who can reopen this
        // link at will and triggers no clock either way.
        setPreview(true);
        setSecureStarted(true);
        setPhase("taking");
        return;
      }
      if (res.attemptId && res.startedAt && timeLimitSec) {
        // Resuming an in-progress attempt: the clock already started server
        // side, so anchor to that real started_at rather than resetting it.
        const end = new Date(res.startedAt).getTime() + timeLimitSec * 1000;
        setDeadline(end);
      }
      setPhase("taking"); // briefing renders below while !secureStarted
    })();
    return () => {
      active = false;
    };
  }, [testId, timeLimitSec]);

  // Timer tick + auto-submit on expiry. Gated on secureStarted: `deadline`
  // may already be set (resuming an in-progress attempt) while the briefing
  // is still on screen, but the countdown must not tick — and timeout must
  // not auto-submit — until the student has actually clicked Begin and
  // entered the exam. That is what closes the "auto-submit a zero while
  // reading the proctor rules" regression.
  useEffect(() => {
    if (phase !== "taking" || !secureStarted || deadline == null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) finishSubmit("timeout");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, secureStarted, deadline, finishSubmit]);

  // Guards against a double-click minting two attempts: beginSecure is async
  // now (it must call startAttempt and await the real started_at before the
  // exam can render), so a second click while the first call is in flight is
  // ignored via beginningRef rather than relying on button disabled state
  // alone (state updates are not synchronous).
  const beginningRef = useRef(false);
  const [beginning, setBeginning] = useState(false);
  const beginSecure = useCallback(async () => {
    if (beginningRef.current) return;
    beginningRef.current = true;
    setBeginning(true);
    setError(null);
    // try/finally: beginningRef/beginning must always unwind, however this
    // exits. Without it, a rejected startAttempt() call (not a returned
    // {ok:false} — an actual thrown/rejected promise, e.g. the RPC commits
    // the attempt but the Server Action response never makes it back) would
    // skip every reset below and leave the Begin button permanently
    // disabled, forcing a reload while the server exam clock keeps running.
    // The catch turns that rejection into a visible, retryable error instead
    // of leaving the student stuck with no feedback.
    try {
      // Resuming an in-progress attempt: the deadline was already anchored
      // to the real started_at in the mount effect above — no need to call
      // startAttempt again, just enter.
      if (deadline != null) {
        setSecureStarted(true);
        void proctor.engage();
        return;
      }
      // A failure that looks transient (dropped connection, blip) is retried
      // rather than immediately stranding the student on the briefing — the
      // server component already confirmed this test is startable before the
      // component rendered at all. Only a genuine refusal (bad link, stale
      // session, wrong role) stops here; retrying those would just fail again
      // and delay a message the student can actually act on.
      const MAX_ATTEMPTS = 3;
      let res = await startAttempt(token);
      let tries = 1;
      while (!res.ok && res.transient && tries < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 400 * tries));
        res = await startAttempt(token);
        tries += 1;
      }
      if (!res.ok) {
        setError(res.error ?? "Could not start the test.");
        return;
      }
      if (res.preview) {
        // The role changed from STUDENT to teacher/admin between mount and
        // this click (or the mount check simply never ran as a student).
        // Mirror the mount effect's handling exactly: enter preview, never
        // the proctored path — no lockdown engage, no deadline, so this
        // person is never trapped in a fake exam with no attempt row to
        // submit against.
        setPreview(true);
        setSecureStarted(true);
        setPhase("taking");
        return;
      }
      if (res.alreadyCompleted) {
        // Raced with another tab/session submitting in the meantime.
        setResultId(res.resultId);
        setPhase("done");
        return;
      }
      if (res.timeLimitSec && res.startedAt) {
        const end = new Date(res.startedAt).getTime() + res.timeLimitSec * 1000;
        setDeadline(end);
      }
      setSecureStarted(true);
      void proctor.engage();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start the test. Please try again.",
      );
    } finally {
      beginningRef.current = false;
      setBeginning(false);
    }
  }, [token, deadline, proctor]);

  // -------------------------------------------------------------------------
  // Terminal / gate screens
  // -------------------------------------------------------------------------
  if (phase === "loading") {
    return <p className="py-16 text-center text-slate-500">Loading test…</p>;
  }

  if (phase === "blocked") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-bold text-slate-900">Can’t open this test</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
      </Card>
    );
  }

  if (phase === "done") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-bold text-slate-900">Already completed</h1>
        <p className="mt-2 text-sm text-slate-600">
          You’ve already taken this test. Each test can be taken once.
        </p>
        {resultId && (
          <Link
            href={`/results?r=${resultId}`}
            className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            View your result
          </Link>
        )}
      </Card>
    );
  }

  if (phase === "finished") {
    return (
      <ExamResult
        scoreEarned={score?.earned}
        scoreTotal={score?.total}
        pendingReview={pendingReview}
        expAwarded={expAwarded}
        newBadges={newBadges}
        cause={submitCause}
        primaryHref={resultId ? `/results?r=${resultId}` : "/tests"}
        primaryLabel={resultId ? "View full result" : "Back to Tests"}
      />
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        {preview && <PreviewBanner />}
        <Card className="text-center">
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            This test has no questions yet.
          </p>
        </Card>
      </div>
    );
  }

  // Secure-start screen: premium pre-exam briefing + the gesture that enters
  // fullscreen and engages the proctor. Preview always sets secureStarted
  // true up front, so a teacher/admin never sees this screen.
  if (!secureStarted) {
    return (
      <SecureBriefing
        title={title}
        subtitle={description}
        questionCount={questions.length}
        timeLimitSec={timeLimitSec}
        error={error}
        busy={beginning}
        onBegin={beginSecure}
        notice={
          timeLimitSec != null && deadline != null ? (
            // Resuming an in-progress attempt: the deadline was already
            // anchored to that attempt's real started_at in the mount
            // effect (read-only check, no attempt created). The countdown
            // itself does not tick until secureStarted (see the timer
            // effect above) — this is a static notice, not a live clock,
            // so reading it costs nothing extra.
            <div
              role="timer"
              aria-live="off"
              className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-800"
            >
              You already started this exam — your timer has been running
              since you began. Click Begin to re-enter.
            </div>
          ) : null
        }
      />
    );
  }

  // -------------------------------------------------------------------------
  // Live exam
  // -------------------------------------------------------------------------
  const q = questions[index];
  const isLast = index === questions.length - 1;
  const submitting = phase === "submitting";
  // finishSubmit snapshots `responses` the moment it fires, so anything the
  // student changes while the request is in flight — or after a timeout /
  // proctor-forced auto-submit has already started — is silently dropped from
  // the payload and then vanishes when the result screen replaces this view.
  // Freezing the answer controls makes the snapshot honest: what they see is
  // what was sent.
  //
  // The advance-lock (`index < highWaterMark`) composes with that submit
  // freeze rather than replacing it: either condition alone is enough to
  // disable the controls, and a submit in flight still wins even on the
  // one question that would otherwise be editable. Preview is exempt from
  // the advance-lock entirely — a previewer has no attempt row, nothing is
  // ever "locked in" for them, they can page freely with Next.
  const locked = submitting || (!preview && index < highWaterMark);
  const answeredCount = questions.filter((qq) =>
    isAnswered(qq.format, responses[qq.id]),
  ).length;
  // 1-based question numbers failing isAnswered. ConfirmSubmit only needs the
  // count (its `unanswered` prop is a number), but keeping this as the full
  // list — rather than a bare count — keeps isAnswered as the single source
  // of truth for both `answeredCount` and this tally, so they can never
  // disagree about which questions are blank.
  const unanswered = questions
    .map((qq, i) => (isAnswered(qq.format, responses[qq.id]) ? null : i + 1))
    .filter((n): n is number => n !== null);

  const setChoiceSingle = (choiceId: string) =>
    setResponses((r) => ({ ...r, [q.id]: { selected: [choiceId] } }));

  const toggleChoiceMulti = (choiceId: string) =>
    setResponses((r) => {
      const cur =
        (r[q.id] as { selected?: string[] } | undefined)?.selected ?? [];
      const next = cur.includes(choiceId)
        ? cur.filter((c) => c !== choiceId)
        : [...cur, choiceId];
      return { ...r, [q.id]: { selected: next } };
    });

  const setText = (text: string) =>
    setResponses((r) => ({ ...r, [q.id]: { text } }));

  const isChoice = CHOICE_FORMATS.includes(q.format);
  const isMulti = q.format === "MULTIPLE_CHOICE_MULTI";
  const selected =
    (responses[q.id] as { selected?: string[] } | undefined)?.selected ?? [];
  const textValue =
    (responses[q.id] as { text?: string } | undefined)?.text ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {preview && <PreviewBanner />}
      {!preview && proctor.needsFullscreen && (
        <FullscreenGuard onReenter={proctor.reenterFullscreen} />
      )}
      {!preview && proctor.tabWarning && !proctor.needsFullscreen && (
        <ProctorWarning onDismiss={proctor.dismissTabWarning} />
      )}

      <ExamHeader
        title={title}
        subtitle={description}
        index={index}
        total={questions.length}
        answered={answeredCount}
        remainingSec={remaining}
        violations={proctor.violations}
        preview={preview}
      />

      {/* A manual submit is now started FROM this same question view — there
          is no separate review screen to drop the student back onto, so a
          failed submitAttempt just leaves them here with the error visible
          and the modal (if it's still open) interactive again. */}
      {error && (
        <p role="alert" className="text-sm font-medium text-error">
          {error}
        </p>
      )}

      {/* Read-only — no click handlers, no jump. Once a student advances
          past a question the only remaining record of it is this strip. */}
      <ProgressStrip
        total={questions.length}
        index={index}
        answered={answeredCount}
      />

      <Card className="space-y-4 select-none">
        <p
          ref={promptRef}
          tabIndex={-1}
          className="font-medium text-slate-900 outline-none"
        >
          {q.prompt}
        </p>

        {isChoice ? (
          <ChoiceList
            choices={choicesOf(q)}
            selected={selected}
            multi={isMulti}
            groupLabel={q.prompt}
            disabled={locked}
            onSelectSingle={setChoiceSingle}
            onToggleMulti={toggleChoiceMulti}
          />
        ) : (
          <textarea
            value={textValue}
            onChange={(e) => setText(e.target.value)}
            disabled={locked}
            rows={3}
            placeholder="Type your answer…"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm text-slate-900 outline-none transition-colors duration-150 focus-visible:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
          />
        )}
      </Card>

      {locked && (
        <p
          role="status"
          className="text-sm font-medium text-slate-600"
        >
          Submitting your answers… your answers are locked while this
          finishes.
        </p>
      )}

      {/* A student gets NO Previous button, by design: this rail is
          strictly one-way. Preview is the deliberate exception — see the
          Previous control below, which renders for teachers/admins only.
          justify-between so preview's two controls sit at opposite ends;
          for a student the single Next/Finish button is pushed right by
          the empty spacer that takes Previous's place. */}
      <div className="flex items-center justify-between gap-3">
        {preview ? (
          // Preview really does page freely, in BOTH directions. A
          // teacher/admin has no attempt row, so none of the one-way
          // machinery applies to them (`locked` is already false above)
          // — and without a Previous button they would be stranded on
          // the last question with no way back through the test they
          // came here to read.
          <Button
            variant="secondary"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            Previous
          </Button>
        ) : (
          // Spacer: keeps the lone Next/Finish button right-aligned
          // under justify-between without a second layout branch.
          <span aria-hidden />
        )}
        {preview ? (
          isLast ? (
            <p className="text-xs font-medium text-slate-500">
              Preview mode — submission is disabled.
            </p>
          ) : (
            <Button onClick={() => setIndex((i) => i + 1)}>
              Next question
            </Button>
          )
        ) : isLast ? (
          // Opens ConfirmSubmit directly over this question — there is no
          // review/summary screen any more. Opening the modal is purely a UI
          // overlay: it does not touch `highWaterMark` and does not lock this
          // question, so "Continue test" in the modal leaves it exactly as
          // editable as it was before the click.
          <Button onClick={() => setConfirmOpen(true)} disabled={locked}>
            Finish test
          </Button>
        ) : (
          <Button
            onClick={() => {
              // Raise the high-water mark to the question being left
              // BEFORE moving forward: this is what makes the lock a
              // real advance-lock rather than a Previous button that
              // happens to be hidden. Once this fires, question `index`
              // can never be rendered editable again — every future
              // render's `locked` check sees index < highWaterMark and
              // disables ChoiceList/textarea, with no code path (jump,
              // back button, anything) able to reopen it.
              setHighWaterMark((h) => Math.max(h, index + 1));
              setIndex((i) => i + 1);
            }}
            disabled={locked}
          >
            Next question
          </Button>
        )}
      </div>

      {!preview && confirmOpen && (
        <ConfirmSubmit
          answered={answeredCount}
          total={questions.length}
          unanswered={unanswered.length}
          note={
            // The modal is a full overlay, so on a failed submit the page's
            // own error paragraph above renders behind it — this is the only
            // copy of the failure the student can actually see while the
            // modal is still open, which is why it stays mounted for a retry
            // instead of closing.
            <>
              This can’t be undone — each test is taken once.
              {error && (
                <span
                  role="alert"
                  className="mt-2 block font-semibold text-error"
                >
                  {error}
                </span>
              )}
            </>
          }
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => finishSubmit()}
        />
      )}
    </div>
  );
}

// Accessible answer options. Single-choice / true-false render as an ARIA
// radiogroup with roving tabindex + arrow-key selection; multi renders as a
// group of checkboxes (each tab-focusable, Space/Enter toggles). Visuals are
// identical to the prior button list — this only adds screen-reader semantics
// and keyboard navigation.
function ChoiceList({
  choices,
  selected,
  multi,
  groupLabel,
  disabled = false,
  onSelectSingle,
  onToggleMulti,
}: {
  choices: Choice[];
  selected: string[];
  multi: boolean;
  groupLabel: string;
  /** Frozen while a submit is in flight, so a discarded edit can't look accepted. */
  disabled?: boolean;
  onSelectSingle: (id: string) => void;
  onToggleMulti: (id: string) => void;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  btnRefs.current = [];

  // For a radiogroup, exactly one option is tab-focusable: the selected one, or
  // the first when nothing is picked yet.
  const activeIdx = (() => {
    const i = choices.findIndex((c) => selected.includes(c.id));
    return i === -1 ? 0 : i;
  })();

  const moveAndSelect = (from: number, dir: 1 | -1) => {
    const n = choices.length;
    if (n === 0 || disabled) return;
    const to = ((from + dir) % n + n) % n;
    btnRefs.current[to]?.focus();
    onSelectSingle(choices[to].id);
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (multi) return; // checkbox group: native tab + Space/Enter is correct
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      moveAndSelect(i, 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      moveAndSelect(i, -1);
    }
  };

  return (
    <div
      role={multi ? "group" : "radiogroup"}
      aria-label={groupLabel}
      className="space-y-2"
    >
      {choices.map((c, i) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            tabIndex={multi ? 0 : i === activeIdx ? 0 : -1}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => {
              if (disabled) return;
              return multi ? onToggleMulti(c.id) : onSelectSingle(c.id);
            }}
            className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-70 ${
              on
                ? "border-brand-500 bg-brand-50 text-slate-900 ring-1 ring-brand-500"
                : "border-line bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                on
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-slate-300"
              }`}
            >
              {on && <Check className="size-3" strokeWidth={3} />}
            </span>
            {c.text}
          </button>
        );
      })}
    </div>
  );
}

// Persistent banner shown for the whole preview session: a teacher/admin must
// never mistake this for a live attempt.
function PreviewBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800"
    >
      <ShieldCheck className="h-4 w-4 shrink-0" />
      Preview mode — nothing is recorded and no attempt is created.
    </div>
  );
}
