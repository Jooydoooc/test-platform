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
      .select("id, attempt_id, status, created_at")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    admin.from("points_ledger").select("points").eq("student_id", id),
    admin
      .from("attempts")
      .select("id, test_id, task_id")
      .eq("student_id", id),
  ]);

  const resultRows = results ?? [];
  const resultIds = resultRows.map((r) => r.id);

  // Per-skill scores for all of this student's results.
  const { data: skillScores } = resultIds.length
    ? await admin
        .from("result_skill_scores")
        .select("result_id, skill_area, correct_count, total_count")
        .in("result_id", resultIds)
    : { data: [] };
  const scores = skillScores ?? [];

  // Skill roll-up: sum correct/total across every result touching that skill.
  const bySkill = new Map<
    SkillArea,
    { correct: number; total: number; results: Set<string> }
  >();
  for (const s of scores) {
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

  // Recent results: title comes from the attempt's test/task.
  const titleByAttempt = new Map<string, string>();
  const attemptTargets = attempts ?? [];
  const testIds = [
    ...new Set(attemptTargets.map((a) => a.test_id).filter(Boolean)),
  ] as string[];
  const taskIds = [
    ...new Set(attemptTargets.map((a) => a.task_id).filter(Boolean)),
  ] as string[];
  const [{ data: tests }, { data: tasks }] = await Promise.all([
    testIds.length
      ? admin.from("tests").select("id, title").in("id", testIds)
      : Promise.resolve({ data: [] }),
    taskIds.length
      ? admin.from("tasks").select("id, title").in("id", taskIds)
      : Promise.resolve({ data: [] }),
  ]);
  const testTitle = new Map((tests ?? []).map((t) => [t.id, t.title]));
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  for (const a of attemptTargets) {
    const title = a.test_id
      ? testTitle.get(a.test_id)
      : a.task_id
        ? taskTitle.get(a.task_id)
        : undefined;
    titleByAttempt.set(a.id, title ?? "Untitled");
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

  let body: UpdateStudentPayload;
  try {
    body = (await req.json()) as UpdateStudentPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

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
  if (body.role !== undefined) {
    if (!MANAGEABLE_ROLES.includes(body.role as Role)) {
      return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
    }
    update.role = body.role;
  }
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/students/[id] — remove the account. Deleting the auth user
// cascades the profile (and its attempts/results/etc.) via ON DELETE CASCADE.
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
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
