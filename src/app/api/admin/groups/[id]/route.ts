import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Level } from "@/lib/database.types";

type Ctx = { params: Promise<{ id: string }> };

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
  console.error(`[api/admin/groups/[id]] ${operation} failed`, {
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
  return fallback;
}

// PATCH /api/admin/groups/[id] — rename a group and/or change its level. Only the
// fields present in the body are touched. ADMIN-gated via requireAdmin (real ADMIN
// role only); the service-role client bypasses RLS, so that gate is the guard.
export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  const { id } = await params;

  let body: { name?: string; level?: Level };
  try {
    body = (await req.json()) as { name?: string; level?: Level };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const patch: { name?: string; level?: Level; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "Group name is required." }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.level !== undefined) {
    if (!LEVELS.includes(body.level)) {
      return NextResponse.json({ ok: false, error: "A valid level is required." }, { status: 400 });
    }
    patch.level = body.level;
  }
  if (patch.name === undefined && patch.level === undefined) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("groups")
    .update(patch)
    .eq("id", id)
    .select("id, name, level")
    .single();

  if (error || !data) {
    if (error) logDbError("update group", error, { groupId: id });
    return NextResponse.json(
      {
        ok: false,
        error: error
          ? safeDbMessage(error, "Could not update the group.")
          : "Group not found.",
      },
      { status: error ? 500 : 404 },
    );
  }
  return NextResponse.json({ ok: true, group: data });
}
