import "server-only";
import { createClient } from "@/lib/supabase/server";

// Group-scoped leaderboard. Uses the group_leaderboard() SECURITY DEFINER RPC so
// students can see rankings without being able to read classmates' raw rows.
// Names are already masked to "First L." by the function. The UI shows the top N
// publicly and always pins the current student's own row (RANKING_AND_MOTIVATION.md).

export interface LeaderboardRow {
  studentId: string;
  displayName: string;
  avgAccuracy: number; // 0..1
  resultsCount: number;
  isMe: boolean;
  rank: number;
}

export const PUBLIC_TOP_N = 5;

export interface Leaderboard {
  top: LeaderboardRow[]; // first PUBLIC_TOP_N
  me: LeaderboardRow | null; // caller's own row (may be outside the top N)
}

export async function getGroupLeaderboard(): Promise<Leaderboard> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_leaderboard");
  if (error) throw error;

  const ranked: LeaderboardRow[] = (data ?? []).map((r, i) => ({
    studentId: r.student_id,
    displayName: r.display_name,
    avgAccuracy: r.avg_accuracy,
    resultsCount: r.results_count,
    isMe: r.is_me,
    rank: i + 1,
  }));

  return {
    top: ranked.slice(0, PUBLIC_TOP_N),
    me: ranked.find((r) => r.isMe) ?? null,
  };
}
