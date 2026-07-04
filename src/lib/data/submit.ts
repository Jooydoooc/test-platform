"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/auth-server";
import { gradeQuestion } from "@/lib/data/grading";
import type { SkillArea } from "@/lib/database.types";

export interface SubmitResult {
  ok: boolean;
  resultId?: string;
  pendingReview?: boolean;
  error?: string;
}

// Submit a test attempt. Grading runs HERE (server), never on the client.
// Reads use the user's RLS-scoped client; the graded writes (attempt, answers,
// result, per-skill scores) use the service-role client because our RLS makes
// results/scores read-only to clients — see supabase/migrations/0002_rls.sql.
export async function submitAttempt(
  testId: string,
  responses: Record<string, unknown>, // questionId -> raw response JSON
): Promise<SubmitResult> {
  const user = await getServerUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (user.role !== "STUDENT") {
    return { ok: false, error: "Only students submit attempts." };
  }

  const supabase = await createClient();

  const { data: test, error: testErr } = await supabase
    .from("tests")
    .select("id, purpose")
    .eq("id", testId)
    .single();
  if (testErr || !test) return { ok: false, error: "Test not found." };

  // Answer keys are needed for grading -> read with the service role (never sent
  // to the client). Scoped to this test's tasks.
  const admin = createAdminClient();
  const { data: items } = await admin
    .from("test_items")
    .select("task_id")
    .eq("test_id", testId);
  const taskIds = (items ?? []).map((i) => i.task_id);
  if (taskIds.length === 0) return { ok: false, error: "Test has no content." };

  const { data: questions } = await admin
    .from("questions")
    .select("id, format, skill_area, points, answer_key")
    .in("task_id", taskIds);
  if (!questions || questions.length === 0) {
    return { ok: false, error: "Test has no questions." };
  }

  // Create the attempt.
  const { data: attempt, error: aErr } = await admin
    .from("attempts")
    .insert({
      student_id: user.id,
      test_id: testId,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (aErr || !attempt) return { ok: false, error: "Could not save attempt." };

  // Grade every question; accumulate per-skill tallies (never blended).
  const perSkill = new Map<SkillArea, { correct: number; total: number }>();
  let anyPending = false;
  const answerRows = questions.map((q) => {
    const outcome = gradeQuestion({
      format: q.format,
      points: q.points,
      answerKey: q.answer_key,
      response: responses[q.id] ?? {},
    });
    if (outcome.pending) anyPending = true;
    const tally = perSkill.get(q.skill_area) ?? { correct: 0, total: 0 };
    tally.total += 1;
    if (outcome.isCorrect === true) tally.correct += 1;
    perSkill.set(q.skill_area, tally);
    return {
      attempt_id: attempt.id,
      question_id: q.id,
      response: (responses[q.id] ?? {}) as object,
      is_correct: outcome.isCorrect,
      awarded_points: outcome.awardedPoints,
      needs_teacher_check: outcome.needsTeacherCheck,
    };
  });

  const { error: ansErr } = await admin.from("attempt_answers").insert(answerRows);
  if (ansErr) return { ok: false, error: "Could not save answers." };

  // Result: PLACEMENT tests are diagnostic -> excluded from progress/ranking.
  const { data: result, error: rErr } = await admin
    .from("results")
    .insert({
      attempt_id: attempt.id,
      student_id: user.id,
      status: anyPending ? "PENDING_REVIEW" : "COMPLETED",
      excluded_from_progress: test.purpose === "PLACEMENT",
    })
    .select("id")
    .single();
  if (rErr || !result) return { ok: false, error: "Could not save result." };

  const skillRows = [...perSkill.entries()].map(([skill, t]) => ({
    result_id: result.id,
    skill_area: skill,
    correct_count: t.correct,
    total_count: t.total,
    accuracy: t.total > 0 ? t.correct / t.total : 0,
  }));
  if (skillRows.length > 0) {
    await admin.from("result_skill_scores").insert(skillRows);
  }

  return { ok: true, resultId: result.id, pendingReview: anyPending };
}
