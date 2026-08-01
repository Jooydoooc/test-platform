import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  QuestionFormat,
  SkillArea,
  Json,
  Level,
  TestSkillScope,
} from "@/lib/database.types";

// Server-side reads for tests. RLS ensures only teachers write content, and
// (since migration 0025) that a student can only read a test row they hold an
// attempt on. Student access to an unopened test runs through the token RPCs
// below — the admin-sent share link is the key.

export interface TestSummary {
  id: string;
  title: string;
  description: string;
  skillScope: string;
  purpose: string;
  level: string | null;
}

export interface TestQuestion {
  id: string;
  order: number;
  format: QuestionFormat;
  skillArea: SkillArea;
  prompt: string;
  content: Json;
  points: number;
}

export interface TestShareLink {
  id: string;
  title: string;
  token: string;
}

export interface HostedTestShareLink {
  id: string;
  title: string;
  token: string;
  skillScope: TestSkillScope;
  level: Level | null;
}

// Teacher-facing: tests with their share tokens, for building /t/<token> links.
// Since 0025 RLS returns nothing here for students (they can't read tests they
// have no attempt on), but callers must still gate this page to admins — the
// tokens themselves are the credentials.
export async function listTestShareLinks(): Promise<TestShareLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .select("id, title, share_token")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    token: t.share_token,
  }));
}

// Teacher-facing: hosted HTML tests with their share tokens, for building
// /ht/<token> links. Mirrors listTestShareLinks; callers must gate to admins.
export async function listHostedTestShareLinks(): Promise<HostedTestShareLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("html_tests")
    .select("id, title, share_token, skill_scope, level")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    share_token: string;
    skill_scope: TestSkillScope;
    level: Level | null;
  }>;
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    token: t.share_token,
    skillScope: t.skill_scope,
    level: t.level,
  }));
}

export async function listTests(): Promise<TestSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .select("id, title, description, skill_scope, purpose, level")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    skillScope: t.skill_scope,
    purpose: t.purpose,
    level: t.level,
  }));
}

// Flattened, ordered questions for a SHARED test, resolved by share token.
//
// This is the only path a student has to test content (migration 0025): the
// RPC is SECURITY DEFINER and keyed on the token, so holding an admin-sent link
// is what grants access. answer_key is never part of the RPC's result —
// grading stays server-side in submitAttempt().
export async function getShareTestQuestions(
  token: string,
): Promise<Omit<TestQuestion, "skillArea">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("share_test_questions", {
    p_token: token,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    order: number;
    format: QuestionFormat;
    prompt: string;
    content: Json;
    points: number;
  }>;
  return rows.map((q) => ({
    id: q.id,
    order: q.order,
    format: q.format,
    prompt: q.prompt,
    content: q.content,
    points: q.points,
  }));
}

// Flattened, ordered questions for a test (test_items -> tasks -> questions).
// answer_key is intentionally NOT selected here — it must never reach the client.
// Admin/teacher path only: under 0025 a student cannot read `tests` rows they
// have no attempt on, so student-facing code must use getShareTestQuestions().
export async function getTestQuestions(testId: string): Promise<TestQuestion[]> {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("test_items")
    .select("order, task_id")
    .eq("test_id", testId)
    .order("order", { ascending: true });
  if (error) throw error;

  const taskIds = (items ?? []).map((i) => i.task_id);
  if (taskIds.length === 0) return [];

  const { data: questions, error: qErr } = await supabase
    .from("questions")
    .select("id, task_id, order, format, skill_area, prompt, content, points")
    .in("task_id", taskIds)
    .order("order", { ascending: true });
  if (qErr) throw qErr;

  const taskOrder = new Map(taskIds.map((id, i) => [id, i]));
  return (questions ?? [])
    .map((q) => ({
      id: q.id,
      order: (taskOrder.get(q.task_id) ?? 0) * 1000 + q.order,
      format: q.format,
      skillArea: q.skill_area,
      prompt: q.prompt,
      content: q.content,
      points: q.points,
    }))
    .sort((a, b) => a.order - b.order);
}
