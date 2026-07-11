import { NextResponse } from "next/server";
import { getServerUser, isAdminRole } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_ENABLED } from "@/lib/supabase/env";
import type { Level, TestSkillScope } from "@/lib/database.types";

const BUCKET = "html-tests";
const MAX_BYTES = 52_428_800; // 50MB — matches the bucket's file_size_limit.

const SKILL_SCOPES: TestSkillScope[] = [
  "GRAMMAR",
  "VOCABULARY",
  "READING",
  "LISTENING",
  "MIXED",
];
const LEVELS: Level[] = [
  "BEGINNER",
  "ELEMENTARY",
  "PRE_IELTS",
  "IELTS_INTRODUCTION",
  "IELTS_GRADUATION",
];

// Upload a self-contained HTML test. The file is stored raw in the html-tests
// bucket; a metadata row gives it a share_token served at /ht/<token>.
//
// Authorization is enforced HERE (fail closed). Writes go through the user's
// RLS-scoped client, so the html_tests + storage policies (is_teacher) are the
// real gate. If the metadata insert fails after upload we remove the object so a
// retry starts clean.
export async function POST(req: Request) {
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      { ok: false, error: "Uploads require the Supabase backend (not configured)." },
      { status: 503 },
    );
  }

  const user = await getServerUser().catch(() => null);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: "Admin access required." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const title = String(form.get("title") ?? "").trim();
  const skillScope = String(form.get("skillScope") ?? "MIXED") as TestSkillScope;
  const rawLevel = String(form.get("level") ?? "");
  const level = rawLevel ? (rawLevel as Level) : null;
  const file = form.get("file");

  if (!title) {
    return NextResponse.json({ ok: false, error: "Title is required." }, { status: 400 });
  }
  if (!SKILL_SCOPES.includes(skillScope)) {
    return NextResponse.json({ ok: false, error: "Invalid skill scope." }, { status: 400 });
  }
  if (level !== null && !LEVELS.includes(level)) {
    return NextResponse.json({ ok: false, error: "Invalid level." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "An HTML file is required." }, { status: 400 });
  }
  if (!/\.html?$/i.test(file.name)) {
    return NextResponse.json(
      { ok: false, error: "File must be a .html file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File exceeds the 50MB limit." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const path = `${user.id}/${crypto.randomUUID()}/${file.name}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "text/html",
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json(
      { ok: false, error: upErr.message || "Could not upload the file." },
      { status: 500 },
    );
  }

  const { data: row, error: rowErr } = await supabase
    .from("html_tests")
    .insert({
      title,
      skill_scope: skillScope,
      level,
      storage_path: path,
      created_by: user.id,
    })
    .select("id, share_token")
    .single();

  if (rowErr || !row) {
    // Remove the orphaned object so the next attempt is clean.
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json(
      { ok: false, error: rowErr?.message ?? "Could not save the test." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: row.id, token: row.share_token });
}
