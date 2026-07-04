import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth-server";
import type { SkillArea } from "@/lib/database.types";

// Student dashboard data — the student's OWN progress only (RLS enforces this
// too). Everything is PER SKILL, never blended (PLATFORM_PURPOSE.md). Placement
// results are excluded. "Trend" = latest vs. the average of the previous 3–4 in
// the same skill (the window defined across the docs).

export interface SkillProgress {
  skill: SkillArea;
  latestAccuracy: number; // 0..1
  averageAccuracy: number; // 0..1 over all counted results
  trend: "up" | "down" | "flat" | "new";
  attempts: number;
}

const TREND_WINDOW = 4;

export async function getStudentProgress(): Promise<SkillProgress[] | null> {
  const user = await getServerUser();
  if (!user || user.role !== "STUDENT") return null;

  const supabase = await createClient();

  const { data: results, error } = await supabase
    .from("results")
    .select("id, created_at")
    .eq("student_id", user.id)
    .eq("excluded_from_progress", false)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const resultIds = (results ?? []).map((r) => r.id);
  if (resultIds.length === 0) return [];
  const order = new Map(resultIds.map((id, i) => [id, i]));

  const { data: scores, error: sErr } = await supabase
    .from("result_skill_scores")
    .select("result_id, skill_area, accuracy")
    .in("result_id", resultIds);
  if (sErr) throw sErr;

  // Collect (chronological index, accuracy) per skill, then sort by recency so
  // "latest" and the trend window are computed against real order.
  const bySkill = new Map<SkillArea, { idx: number; accuracy: number }[]>();
  for (const row of scores ?? []) {
    const arr = bySkill.get(row.skill_area) ?? [];
    arr.push({ idx: order.get(row.result_id) ?? 0, accuracy: row.accuracy });
    bySkill.set(row.skill_area, arr);
  }

  const out: SkillProgress[] = [];
  for (const [skill, rows] of bySkill.entries()) {
    const accs = rows.sort((a, b) => a.idx - b.idx).map((r) => r.accuracy);
    const attempts = accs.length;
    const average = accs.reduce((s, a) => s + a, 0) / attempts;
    const latest = accs[attempts - 1];
    let trend: SkillProgress["trend"] = "new";
    if (attempts >= 2) {
      const prev = accs.slice(Math.max(0, attempts - 1 - TREND_WINDOW), attempts - 1);
      const prevAvg = prev.reduce((s, a) => s + a, 0) / prev.length;
      const delta = latest - prevAvg;
      trend = delta > 0.02 ? "up" : delta < -0.02 ? "down" : "flat";
    }
    out.push({
      skill,
      latestAccuracy: latest,
      averageAccuracy: average,
      trend,
      attempts,
    });
  }
  return out;
}
