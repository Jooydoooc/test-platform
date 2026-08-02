import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Level } from "@/lib/database.types";

const LEVELS: Level[] = [
  "BEGINNER",
  "ELEMENTARY",
  "PRE_IELTS",
  "IELTS_INTRODUCTION",
  "IELTS_GRADUATION",
];

// Postgres error details must never reach the client. Log the raw error
// server-side with enough context to diagnose, and return a short, safe
// message that still distinguishes "conflict" from "something went wrong".
type DbError = { message?: string; code?: string; details?: string } | null | undefined;

function logDbError(
  operation: string,
  error: DbError,
  extra?: Record<string, unknown>,
) {
  console.error(`[api/admin/groups] ${operation} failed`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    ...extra,
  });
}

function safeDbMessage(error: DbError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "23505") return "A group with that name already exists.";
  if (error.code === "23503") return "That references something that no longer exists.";
  if (error.code === "PGRST116") return "Not found.";
  return fallback;
}

// POST /api/admin/groups — create a group. Owned by the creating admin so the
// teacher-scoped RLS (owns_group) treats it as theirs too. ADMIN-gated.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  let body: { name?: string; level?: Level };
  try {
    body = (await req.json()) as { name?: string; level?: Level };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "Group name is required." }, { status: 400 });
  }
  if (!body.level || !LEVELS.includes(body.level)) {
    return NextResponse.json({ ok: false, error: "A valid level is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("groups")
    .insert({ name, level: body.level, owner_id: gate.user.id })
    .select("id, name, level")
    .single();

  if (error || !data) {
    logDbError("insert group", error, { ownerId: gate.user.id, name });
    return NextResponse.json(
      { ok: false, error: safeDbMessage(error, "Could not create the group.") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, group: data });
}
