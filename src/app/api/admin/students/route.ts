import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StudentSummary } from "@/lib/admin-students";

// GET /api/admin/students — every profile (all roles) with email, group name and
// a graded-results count, plus the group list for filtering / reassignment.
// Service-role client: bypasses RLS so an admin sees the whole roster, not just
// groups they own. Guarded by requireAdmin (real ADMIN role only).
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const admin = createAdminClient();

  const [{ data: profiles, error: pErr }, { data: groups, error: gErr }] =
    await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, role, first_name, last_name, group_id, last_active_at, created_at",
        )
        // Soft-delete filter: exclude accounts soft-deleted by migration 0023.
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      admin.from("groups").select("id, name, level").order("name"),
    ]);

  if (pErr || gErr) {
    return NextResponse.json(
      { ok: false, error: pErr?.message ?? gErr?.message ?? "Query failed." },
      { status: 500 },
    );
  }

  // Emails live on auth.users, not profiles. One admin listing (first page) is
  // enough for a class-sized platform; keyed by uid.
  const emailById = new Map<string, string>();
  const { data: authList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  for (const u of authList?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  // Graded-results count per student, aggregated in-process (one light select).
  const { data: results } = await admin.from("results").select("student_id");
  const resultsByStudent = new Map<string, number>();
  for (const r of results ?? []) {
    resultsByStudent.set(
      r.student_id,
      (resultsByStudent.get(r.student_id) ?? 0) + 1,
    );
  }

  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));

  const students: StudentSummary[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "",
    firstName: p.first_name,
    lastName: p.last_name,
    role: p.role,
    groupId: p.group_id,
    groupName: p.group_id ? groupNameById.get(p.group_id) ?? null : null,
    lastActiveAt: p.last_active_at,
    createdAt: p.created_at,
    resultsCount: resultsByStudent.get(p.id) ?? 0,
  }));

  return NextResponse.json({
    ok: true,
    students,
    groups: groups ?? [],
  });
}
