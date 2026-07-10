import Link from "next/link";
import { Trophy, Users, Target, ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui";
import {
  getGroupLeaderboard,
  PUBLIC_TOP_N,
  type Leaderboard,
  type LeaderboardRow,
} from "@/lib/data/leaderboard";

// Real, group-scoped leaderboard backed by the group_leaderboard() RPC:
// server-computed aggregates, masked names ("First L."), the caller's own group
// only. Ranked by average accuracy across graded results (the real metric the
// backend exposes). Top N are public; the student's own row is always shown,
// pinned below the list when they sit outside the top N.

export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"];

function accuracyPct(a: number): number {
  return Math.round(a * 100);
}

export default async function LeaderboardPage() {
  let board: Leaderboard = { top: [], me: null };
  let failed = false;
  try {
    board = await getGroupLeaderboard();
  } catch {
    failed = true;
  }

  const meInTop = board.top.some((r) => r.isMe);
  const hasData = board.top.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Premium gradient hero — matches Tests + Dashboard */}
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-brand-900 to-brand-800 p-6 text-white shadow-card-hover sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl motion-reduce:hidden" />
        <div className="pointer-events-none absolute -bottom-28 left-16 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl motion-reduce:hidden" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-white/20">
            <Trophy className="h-3.5 w-3.5" />
            Leaderboard
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Your group standings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100/90">
            Ranked by average accuracy across graded tests. Only the top{" "}
            {PUBLIC_TOP_N} appear publicly — you always see your own position.
          </p>

          {board.me && (
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/15">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-extrabold">
                #{board.me.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-brand-100/80">You are ranked</p>
                <p className="text-lg font-bold leading-tight">
                  {accuracyPct(board.me.avgAccuracy)}% accuracy
                  <span className="ml-2 text-sm font-medium text-brand-100/70">
                    · {board.me.resultsCount}{" "}
                    {board.me.resultsCount === 1 ? "result" : "results"}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {failed ? (
        <EmptyCard
          icon={<Target className="h-7 w-7" />}
          title="Couldn't load standings"
          body="The leaderboard is temporarily unavailable. Please try again shortly."
        />
      ) : !hasData ? (
        <EmptyCard
          icon={<Users className="h-7 w-7" />}
          title="No standings yet"
          body="Once you're in a group and have completed graded tests, your group's rankings will appear here."
          cta
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">
              Top {Math.min(PUBLIC_TOP_N, board.top.length)}
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {board.top.map((row) => (
              <Row key={row.studentId} row={row} />
            ))}

            {/* Pin the student's own row when they're outside the public top N. */}
            {board.me && !meInTop && (
              <>
                <li
                  aria-hidden
                  className="select-none py-1 text-center text-xs text-slate-300"
                >
                  ···
                </li>
                <Row row={board.me} pinned />
              </>
            )}
          </ul>
        </Card>
      )}

      <p className="px-1 text-center text-xs text-slate-400">
        Names are shown as first name + last initial to protect privacy.
      </p>
    </div>
  );
}

function Row({ row, pinned = false }: { row: LeaderboardRow; pinned?: boolean }) {
  const medal = row.rank <= 3 ? MEDALS[row.rank - 1] : null;
  const pctVal = accuracyPct(row.avgAccuracy);
  return (
    <li
      className={`flex items-center gap-3 px-5 py-3 ${
        pinned
          ? "border-t-2 border-brand-200 bg-brand-50/70"
          : row.isMe
            ? "bg-brand-50/50"
            : ""
      }`}
    >
      <span className="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-slate-500">
        {medal ?? `#${row.rank}`}
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
        {row.displayName.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {row.displayName}
          {row.isMe && (
            <span className="ml-2 text-xs font-semibold text-brand-600">You</span>
          )}
        </p>
        <p className="text-xs text-slate-400">
          {row.resultsCount} {row.resultsCount === 1 ? "result" : "results"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-emerald-600">
          {pctVal}%
        </p>
        <p className="text-[11px] text-slate-400">accuracy</p>
      </div>
    </li>
  );
}

function EmptyCard({
  icon,
  title,
  body,
  cta = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: boolean;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="max-w-sm text-sm text-slate-600">{body}</p>
      {cta && (
        <Link
          href="/tests"
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Sparkles className="h-4 w-4" />
          Take a test
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </Card>
  );
}
