import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  QuestionFormat,
  SkillArea,
  Json,
} from "@/lib/database.types";

// Server-side reads for tests. RLS ensures only logged-in users read content and
// only teachers can write it. Per-assignment student gating is a documented gap
// (enforced at query level once assignments are wired).

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

// Teacher-facing: tests with their share tokens, for building /t/<token> links.
// RLS lets any signed-in user read tests; callers must gate this to teachers.
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

// Flattened, ordered questions for a test (test_items -> tasks -> questions).
// answer_key is intentionally NOT selected here — it must never reach the client.
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
