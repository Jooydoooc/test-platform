"use server";

import { getServerUser, isAdminRole } from "@/lib/auth-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import { validateTest } from "@/lib/author/validate-question";
import type { Question, Test } from "@/lib/types";
import type {
  QuestionFormat,
  SkillArea,
  TestSkillScope,
} from "@/lib/database.types";

// Publish a locally-authored test (localStorage editor) into Supabase so
// students take it through the EXISTING server-graded flow at /t/<share_token>.
// The editor stays the draft surface; this snapshots a copy into the DB model
// (tests -> test_items -> tasks -> questions).
//
// Trust boundary: authoring writes are RLS-gated to is_teacher() (ADMIN). We
// verify the caller is an admin, then use the service-role client for the
// multi-table write (mirrors submit.ts). Nothing here trusts a client-passed id
// for identity — the created_by is always the authenticated admin.

export type PublishResult =
  | { ok: true; testId: string; shareToken: string }
  | { ok: false; error: string };

// The 4 skills valid for BOTH test_skill_scope AND skill_area (WRITING/SPEAKING
// are skill_area-only, so a single-skill test can't use them here).
const PUBLISHABLE_SKILLS: SkillArea[] = [
  "GRAMMAR",
  "VOCABULARY",
  "READING",
  "LISTENING",
];

// Map one local Question to the DB question shape (without task_id — added after
// the task is created). content/answer_key follow the contract read by
// src/lib/data/grading.ts and rendered by src/app/t/[token]/TestTaker.tsx.
function mapQuestion(q: Question, order: number, skill: SkillArea) {
  const base = {
    order, // written to the "order" column below
    skill_area: skill,
    prompt: q.prompt,
    points: Math.max(1, q.points),
  };

  switch (q.type) {
    case "single":
      return {
        ...base,
        format: "MULTIPLE_CHOICE_SINGLE" as QuestionFormat,
        content: { choices: q.choices },
        answer_key: { correct: q.correct },
      };
    case "multiple":
      return {
        ...base,
        format: "MULTIPLE_CHOICE_MULTI" as QuestionFormat,
        content: { choices: q.choices },
        answer_key: { correct: q.correct },
      };
    case "boolean":
      return {
        ...base,
        format: "TRUE_FALSE" as QuestionFormat,
        content: {}, // TestTaker renders a fixed true/false pair
        answer_key: { correct: q.correct }, // ["true"] | ["false"]
      };
    case "short":
      return {
        ...base,
        format: "SHORT_ANSWER" as QuestionFormat,
        content: {},
        answer_key: { accepted: q.correct },
      };
    case "gap":
      return {
        ...base,
        format: "GAP_FILL" as QuestionFormat,
        content: {},
        answer_key: { accepted: q.correct },
      };
  }
}

export async function publishAuthoredTest(
  test: Test,
  skill: SkillArea,
): Promise<PublishResult> {
  if (!SUPABASE_ENABLED) {
    return { ok: false, error: "Backend not configured." };
  }

  const user = await getServerUser().catch(() => null);
  if (!user) return { ok: false, error: "Authentication required." };
  if (!isAdminRole(user.role)) {
    return { ok: false, error: "Admin access required to publish." };
  }

  if (!PUBLISHABLE_SKILLS.includes(skill)) {
    return { ok: false, error: "Pick a skill (Grammar, Vocabulary, Reading, or Listening)." };
  }
  // Safe after the guard: all PUBLISHABLE_SKILLS are valid test_skill_scope values.
  const scope: TestSkillScope = skill as TestSkillScope;

  // Server-side readiness gate — never publish an incomplete test even if the
  // client button was somehow enabled.
  if (test.questions.length === 0) {
    return { ok: false, error: "Add at least one question before publishing." };
  }
  if (!validateTest(test.questions).ready) {
    return { ok: false, error: "Fix the incomplete questions before publishing." };
  }

  const admin = createAdminClient();
  const timeLimitSec =
    test.durationMinutes && test.durationMinutes > 0
      ? test.durationMinutes * 60
      : null;

  // ---------------------------------------------------------------------------
  // Resolve the target tests row: update-in-place when this draft was already
  // published (stable share link + prior attempts stay attached), else create.
  // ---------------------------------------------------------------------------
  let testId: string;
  let shareToken: string;
  let createdHere = false;

  const existing = test.supabaseTestId
    ? (
        await admin
          .from("tests")
          .select("id, share_token, created_by")
          .eq("id", test.supabaseTestId)
          .maybeSingle()
      ).data
    : null;

  if (existing && existing.created_by === user.id) {
    // Update path — rebuild the children below.
    testId = existing.id;
    shareToken = existing.share_token as string;

    // FK/orphan guard FIRST, before mutating anything: attempt_answers.question_id
    // references questions WITHOUT ON DELETE CASCADE. If any student has started
    // or completed this test, the cascade delete of tasks → questions would either
    // raise a FK error (if attempt_answers rows exist) or silently orphan attempt
    // data. We refuse the destructive rebuild in that case rather than risk data
    // loss. Checking BEFORE the metadata update means a rejected overwrite leaves
    // the existing test completely untouched (no partial title/description change).
    const { data: items, error: itemsErr } = await admin
      .from("test_items")
      .select("task_id")
      .eq("test_id", testId);
    if (itemsErr) return { ok: false, error: itemsErr.message };
    const oldTaskIds = (items ?? []).map((i) => i.task_id);

    if (oldTaskIds.length > 0) {
      // Check for any attempts that reference this test directly.
      const { count: attemptCount, error: cntErr } = await admin
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("test_id", testId);
      // Fail closed: if we cannot confirm zero attempts, do NOT delete.
      if (cntErr) return { ok: false, error: cntErr.message };

      if (attemptCount && attemptCount > 0) {
        return {
          ok: false,
          error:
            `Cannot overwrite this test — ${attemptCount} student attempt(s) already exist. ` +
            "To avoid orphaning student answers, publish this as a new test instead.",
        };
      }
    }

    // Guard passed — now it is safe to refresh metadata and rebuild children.
    const { error: updErr } = await admin
      .from("tests")
      .update({
        title: test.title || "Untitled test",
        description: test.description ?? "",
        skill_scope: scope,
        time_limit_sec: timeLimitSec,
        updated_at: new Date().toISOString(),
      })
      .eq("id", testId);
    if (updErr) return { ok: false, error: updErr.message };

    // Delete item links first, then tasks (cascades their questions via FK on
    // questions.task_id).
    await admin.from("test_items").delete().eq("test_id", testId);
    if (oldTaskIds.length > 0) {
      await admin.from("tasks").delete().in("id", oldTaskIds);
    }
  } else {
    // Create path.
    const { data: created, error: insErr } = await admin
      .from("tests")
      .insert({
        title: test.title || "Untitled test",
        description: test.description ?? "",
        skill_scope: scope,
        purpose: "CUSTOM",
        time_limit_sec: timeLimitSec,
        created_by: user.id,
      })
      .select("id, share_token")
      .single();
    if (insErr || !created) {
      return { ok: false, error: insErr?.message ?? "Could not create the test." };
    }
    testId = created.id;
    shareToken = created.share_token as string;
    createdHere = true;
  }

  // ---------------------------------------------------------------------------
  // Rebuild children: one container task + its questions + the test_item link.
  // On any failure, clean up a test row we created this call so a retry is clean.
  // ---------------------------------------------------------------------------
  const fail = async (message: string): Promise<PublishResult> => {
    if (createdHere) await admin.from("tests").delete().eq("id", testId);
    return { ok: false, error: message };
  };

  const { data: task, error: taskErr } = await admin
    .from("tasks")
    .insert({
      title: test.title || "Authored test",
      category: "TEST",
      skill_area: skill,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (taskErr || !task) return fail(taskErr?.message ?? "Could not create the task.");

  const questionRows = test.questions.map((q, i) => ({
    task_id: task.id,
    ...mapQuestion(q, i, skill),
  }));
  const { error: qErr } = await admin.from("questions").insert(questionRows);
  if (qErr) return fail(qErr.message);

  const { error: itemErr } = await admin
    .from("test_items")
    .insert({ test_id: testId, task_id: task.id, order: 0 });
  if (itemErr) return fail(itemErr.message);

  return { ok: true, testId, shareToken };
}
