import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MANAGEABLE_ROLES,
  type RecentResult,
  type SkillStat,
  type StudentDetail,
  type StudentSummary,
  type UpdateStudentPayload,
} from "@/lib/admin-students";
import type { ProfileRow, Role, SkillArea } from "@/lib/database.types";

type Ctx = { params: Promise<{ id: string }> };

// Postgres error details must never reach the client. Log the raw error
// server-side with enough context to diagnose, and return a short, safe
// message that still distinguishes "conflict" from "something went wrong".
type DbError = { message?: string; code?: string; details?: string } | null | undefined;

function logDbError(
  operation: string,
  error: DbError,
  extra?: Record<string, unknown>,
) {
  console.error(`[api/admin/students/[id]] ${operation} failed`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    ...extra,
  });
}

function safeDbMessage(error: DbError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "23505") return "That would conflict with an existing record.";
  if (error.code === "23503") return "That references something that no longer exists.";
  return fallback;
}

// GET /api/admin/students/[id] — full performance view for one student:
// per-skill accuracy, totals, points, and recent graded results.
export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, role, first_name, last_name, group_id, last_active_at, created_at")
    .eq("id", id)
    .single();
  if (pErr || !profile) {
    return NextResponse.json(
      { ok: false, error: "Student not found." },
      { status: 404 },
    );
  }

  const [
    { data: authUser },
    { data: group },
    { count: attemptsCount },
    { data: results },
    { data: points },
    { data: attempts },
  ] = await Promise.all([
    admin.auth.admin.getUserById(id),
    profile.group_id
      ? admin.from("groups").select("name").eq("id", profile.group_id).single()
      : Promise.resolve({ data: null }),
    admin
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("student_id", id),
    admin
      .from("results")
      .select("id, attempt_id, status, created_at, excluded_from_progress")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    admin.from("points_ledger").select("points").eq("student_id", id),
    admin
      .from("attempts")
      .select("id, test_id, task_id, html_test_id, vocab_source_id, superseded_at")
      .eq("student_id", id),
  ]);

  const resultRows = results ?? [];
  const resultIds = resultRows.map((r) => r.id);

  // Per-skill scores for all of this student's results. Fetched for every
  // result (including excluded ones) because `recent[]` below still needs the
  // correct/total for a superseded result — only the aggregate skips it (see
  // the excludedResultIds filter just below).
  const { data: skillScores } = resultIds.length
    ? await admin
        .from("result_skill_scores")
        .select("result_id, skill_area, correct_count, total_count")
        .in("result_id", resultIds)
    : { data: [] };
  const scores = skillScores ?? [];

  // Results a re-open has flagged excluded_from_progress (the superseded
  // "before" row of a retake). resultsCount and recent[] intentionally keep
  // counting/showing these — they're real history, and recent[] is exactly
  // where the teacher sees "reopened, excluded from progress". Only the skill
  // aggregate below drops them, because summing both the discarded attempt and
  // its replacement would blend two scores into one percentage the teacher
  // reads as a single truth.
  const excludedResultIds = new Set(
    resultRows.filter((r) => r.excluded_from_progress).map((r) => r.id),
  );

  // Skill roll-up: sum correct/total across every NON-EXCLUDED result touching
  // that skill (excluded/superseded results are omitted — see above).
  const bySkill = new Map<
    SkillArea,
    { correct: number; total: number; results: Set<string> }
  >();
  for (const s of scores) {
    if (excludedResultIds.has(s.result_id)) continue;
    const cur =
      bySkill.get(s.skill_area) ??
      { correct: 0, total: 0, results: new Set<string>() };
    cur.correct += s.correct_count;
    cur.total += s.total_count;
    cur.results.add(s.result_id);
    bySkill.set(s.skill_area, cur);
  }
  const skills: SkillStat[] = [...bySkill.entries()]
    .map(([skill, v]) => ({
      skill,
      accuracy: v.total > 0 ? v.correct / v.total : 0,
      resultCount: v.results.size,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Recent results: title comes from the attempt's test/task/hosted test, and
  // each result's attempt carries the identity a re-open acts on (attempt id,
  // whether it's already superseded, and what kind of attempt it is).
  const titleByAttempt = new Map<string, string>();
  const kindByAttempt = new Map<string, RecentResult["attemptKind"]>();
  const supersededByAttempt = new Map<string, boolean>();
  const attemptTargets = attempts ?? [];
  const testIds = [
    ...new Set(attemptTargets.map((a) => a.test_id).filter(Boolean)),
  ] as string[];
  const taskIds = [
    ...new Set(attemptTargets.map((a) => a.task_id).filter(Boolean)),
  ] as string[];
  const htmlTestIds = [
    ...new Set(attemptTargets.map((a) => a.html_test_id).filter(Boolean)),
  ] as string[];
  const [{ data: tests }, { data: tasks }, { data: htmlTests }] = await Promise.all([
    testIds.length
      ? admin.from("tests").select("id, title").in("id", testIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? admin.from("tasks").select("id, title").in("id", taskIds)
      : Promise.resolve({ data: [] }),
    htmlTestIds.length
      ? admin.from("html_tests").select("id, title").in("id", htmlTestIds)
      : Promise.resolve({ data: [] }),
  ]);
  const testTitle = new Map((tests ?? []).map((t) => [t.id, t.title]));
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  const htmlTestTitle = new Map((htmlTests ?? []).map((t) => [t.id, t.title]));
  for (const a of attemptTargets) {
    const title = a.test_id
      ? testTitle.get(a.test_id)
      : a.html_test_id
        ? htmlTestTitle.get(a.html_test_id)
        : a.task_id
          ? taskTitle.get(a.task_id)
          : undefined;
    titleByAttempt.set(a.id, title ?? "Untitled");
    kindByAttempt.set(
      a.id,
      a.test_id
        ? "test"
        : a.html_test_id
          ? "html_test"
          : a.task_id
            ? "task"
            : a.vocab_source_id
              ? "vocab"
              : "unknown",
    );
    supersededByAttempt.set(a.id, a.superseded_at != null);
  }

  // Correct/total per result (sum of its skill scores).
  const totalsByResult = new Map<string, { correct: number; total: number }>();
  for (const s of scores) {
    const cur = totalsByResult.get(s.result_id) ?? { correct: 0, total: 0 };
    cur.correct += s.correct_count;
    cur.total += s.total_count;
    totalsByResult.set(s.result_id, cur);
  }
  const recent: RecentResult[] = resultRows.slice(0, 10).map((r) => {
    const t = totalsByResult.get(r.id) ?? { correct: 0, total: 0 };
    return {
      id: r.id,
      title: titleByAttempt.get(r.attempt_id) ?? "Untitled",
      status: r.status,
      createdAt: r.created_at,
      correct: t.correct,
      total: t.total,
      accuracy: t.total > 0 ? t.correct / t.total : 0,
      attemptId: r.attempt_id,
      attemptKind: kindByAttempt.get(r.attempt_id) ?? "unknown",
      superseded: supersededByAttempt.get(r.attempt_id) ?? false,
    };
  });

  const summary: StudentSummary = {
    id: profile.id,
    email: authUser?.user?.email ?? "",
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: profile.role,
    groupId: profile.group_id,
    groupName: group?.name ?? null,
    lastActiveAt: profile.last_active_at,
    createdAt: profile.created_at,
    resultsCount: resultRows.length,
  };

  const detail: StudentDetail = {
    student: summary,
    attemptsCount: attemptsCount ?? 0,
    resultsCount: resultRows.length,
    points: (points ?? []).reduce((sum, p) => sum + p.points, 0),
    skills,
    recent,
  };

  return NextResponse.json({ ok: true, detail });
}

// PATCH /api/admin/students/[id] — edit name, role, or group assignment.
export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  // Runtime validation — only known keys are permitted; unknown keys are
  // rejected to prevent accidental DB column injection via the spread below.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: "Request body must be a JSON object." }, { status: 400 });
  }
  const ALLOWED_KEYS = new Set(["firstName", "lastName", "role", "groupId"]);
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json(
        { ok: false, error: `Unknown field: "${key}".` },
        { status: 400 },
      );
    }
  }

  const rawBody = raw as Record<string, unknown>;

  // Validate firstName — must be a string, non-empty, max 100 chars.
  if (rawBody.firstName !== undefined) {
    if (typeof rawBody.firstName !== "string") {
      return NextResponse.json({ ok: false, error: "firstName must be a string." }, { status: 400 });
    }
    const trimmed = rawBody.firstName.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ ok: false, error: "firstName must not be empty." }, { status: 400 });
    }
    if (trimmed.length > 100) {
      return NextResponse.json({ ok: false, error: "firstName must be 100 characters or fewer." }, { status: 400 });
    }
  }

  // Validate lastName — must be a string, max 100 chars (empty is allowed to
  // support single-name profiles).
  if (rawBody.lastName !== undefined) {
    if (typeof rawBody.lastName !== "string") {
      return NextResponse.json({ ok: false, error: "lastName must be a string." }, { status: 400 });
    }
    if (rawBody.lastName.trim().length > 100) {
      return NextResponse.json({ ok: false, error: "lastName must be 100 characters or fewer." }, { status: 400 });
    }
  }

  // Validate role — must be one of the manageable role strings.
  if (rawBody.role !== undefined) {
    if (typeof rawBody.role !== "string" || !MANAGEABLE_ROLES.includes(rawBody.role as Role)) {
      return NextResponse.json(
        { ok: false, error: `role must be one of: ${MANAGEABLE_ROLES.join(", ")}.` },
        { status: 400 },
      );
    }
  }

  // Validate groupId — must be a UUID string or null (null = unassign from group).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (rawBody.groupId !== undefined && rawBody.groupId !== null) {
    if (typeof rawBody.groupId !== "string" || !UUID_RE.test(rawBody.groupId)) {
      return NextResponse.json(
        { ok: false, error: "groupId must be a valid UUID or null." },
        { status: 400 },
      );
    }
  }

  // Narrowed, validated payload.
  const body: UpdateStudentPayload = rawBody as UpdateStudentPayload;

  // Safety: an admin can't demote themselves out of ADMIN (avoids self lock-out).
  if (id === gate.user.id && body.role && body.role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "You can't change your own admin role." },
      { status: 400 },
    );
  }

  const update: Partial<ProfileRow> = {};
  if (body.firstName !== undefined) update.first_name = body.firstName.trim();
  if (body.lastName !== undefined) update.last_name = body.lastName.trim();
  if (body.role !== undefined) update.role = body.role; // validated above
  if (body.groupId !== undefined) update.group_id = body.groupId;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = createAdminClient();

  // Validate the target group exists when reassigning (not clearing).
  if (typeof update.group_id === "string") {
    const { data: g } = await admin
      .from("groups")
      .select("id")
      .eq("id", update.group_id)
      .single();
    if (!g) {
      return NextResponse.json({ ok: false, error: "Group not found." }, { status: 400 });
    }
  }

  const { error } = await admin.from("profiles").update(update).eq("id", id);
  if (error) {
    logDbError("PATCH student", error, { studentId: id });
    return NextResponse.json(
      { ok: false, error: safeDbMessage(error, "Could not update the student.") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/students/[id] — soft-delete the account.
//
// Soft delete (migration 0023): sets profiles.deleted_at = now() and bans the
// auth user for 100 years so they cannot sign back in. All historical data
// (attempts, results, points_ledger) is RETAINED — only the profile is hidden
// from active rosters and leaderboards. No cascade-erase happens.
export async function DELETE(_req: Request, { params }: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;

  if (id === gate.user.id) {
    return NextResponse.json(
      { ok: false, error: "You can't delete your own account." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Step 1: Soft-delete the profile row — sets deleted_at so the student
  // disappears from active listings and leaderboards but data is preserved.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (profileErr) {
    logDbError("DELETE student (soft-delete)", profileErr, { studentId: id });
    return NextResponse.json(
      { ok: false, error: safeDbMessage(profileErr, "Could not delete the student.") },
      { status: 500 },
    );
  }

  // Step 2: Ban the auth user so they cannot sign back in while soft-deleted.
  // 876000h ≈ 100 years. If this step fails we still consider the operation
  // successful (the profile is already hidden) but surface a warning.
  const { error: banErr } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "876000h",
  });

  if (banErr) {
    return NextResponse.json({
      ok: true,
      warning:
        "Account data was soft-deleted, but the sign-in ban did not apply. " +
        "The student may still be able to log in — check the auth dashboard.",
    });
  }

  return NextResponse.json({ ok: true });
}
