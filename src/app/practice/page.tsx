"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  GraduationCap,
  ListChecks,
  Search,
  Sparkles,
  Sprout,
  Star,
  Target,
  X,
} from "lucide-react";
import { LinkButton, ProgressBar } from "@/components/ui";
import { useCollections } from "@/lib/vocab-store";
import {
  bookOf,
  categoryOf,
  groupOf,
  useAttempts,
  useTests,
} from "@/lib/store";
import { useSession } from "@/lib/auth";
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  orderBooks,
  type Attempt,
  type Category,
  type Test,
} from "@/lib/types";

/* ----------------------------- config maps ----------------------------- */

const LEVEL_ICON: Record<Category, typeof Sprout> = {
  Beginner: Sprout,
  Elementary: BookOpen,
  "Pre-IELTS": Target,
  "IELTS Introduction": GraduationCap,
  "IELTS Graduation": Award,
};

const FILTERS = [
  "All",
  "Grammar",
  "Vocabulary",
  "Reading",
  "Listening",
  "General Knowledge",
] as const;
type Filter = (typeof FILTERS)[number];

function testMatchesFilter(t: Test, filter: Filter): boolean {
  if (filter === "All") return true;
  if (filter === "General Knowledge") {
    return bookOf(t).toLowerCase().includes("general knowledge");
  }
  return groupOf(t) === `${filter} Tests`;
}

function pct(a: Attempt): number {
  return a.maxScore > 0 ? a.score / a.maxScore : 0;
}

// Consecutive days (ending today or yesterday) with at least one attempt.
function computeStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = new Set(timestamps.map((ts) => key(new Date(ts))));
  const cursor = new Date();
  if (!days.has(key(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(key(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(key(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/* ------------------------------- page ---------------------------------- */

export default function PracticePage() {
  const tests = useTests().filter((t) => t.questions.length > 0);
  const attempts = useAttempts();
  const { user } = useSession();
  const collections = useCollections();

  // ---- preserved business logic (unchanged behaviour) ----
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [activeBook, setActiveBook] = useState<string | null>(null);

  // ---- new UI-only state ----
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inCategory = useMemo(
    () => tests.filter((t) => categoryOf(t) === category),
    [tests, category],
  );
  const books = useMemo(
    () => orderBooks(category, inCategory.map(bookOf)),
    [inCategory, category],
  );
  // Default to the first book that actually has tests, not an empty catalog
  // placeholder, so the detail panel is never empty on first paint.
  const firstWithTests = useMemo(
    () => books.find((b) => inCategory.some((t) => bookOf(t) === b)),
    [books, inCategory],
  );
  const currentBook =
    activeBook && books.includes(activeBook)
      ? activeBook
      : (firstWithTests ?? books[0] ?? null);
  const shown = inCategory.filter((t) => bookOf(t) === currentBook);

  // Identity for personal stats/completion: the signed-in user only.
  // We no longer fall back to the most recent device-local taker so that a
  // fresh student is never shown another user's name, XP, or accuracy.
  const identityName = useMemo(() => user?.name ?? null, [user]);

  const myAttempts = useMemo(
    () =>
      identityName
        ? attempts.filter((a) => a.takerName === identityName)
        : [],
    [attempts, identityName],
  );

  // Test IDs this student has completed at least once — powers completion %.
  const completedIds = useMemo(
    () => new Set(myAttempts.map((a) => a.testId)),
    [myAttempts],
  );

  const stats = useMemo(() => {
    const qCount = new Map(tests.map((t) => [t.id, t.questions.length]));
    const xp = myAttempts.reduce((s, a) => s + a.score, 0);
    const questions = myAttempts.reduce(
      (s, a) =>
        s + (Object.keys(a.answers).length || qCount.get(a.testId) || a.maxScore),
      0,
    );
    const accuracy =
      myAttempts.length > 0
        ? Math.round(
            (myAttempts.reduce((s, a) => s + pct(a), 0) / myAttempts.length) *
              100,
          )
        : 0;
    const streak = computeStreak(myAttempts.map((a) => a.submittedAt));

    return { xp, questions, accuracy, streak };
  }, [tests, myAttempts]);

  // Books filtered by search + content filter (sidebar view only).
  const visibleBooks = useMemo(
    () =>
      books.filter((book) => {
        if (search && !book.toLowerCase().includes(search.toLowerCase()))
          return false;
        if (filter !== "All") {
          const inBook = inCategory.filter((t) => bookOf(t) === book);
          if (!inBook.some((t) => testMatchesFilter(t, filter))) return false;
        }
        return true;
      }),
    [books, inCategory, search, filter],
  );

  function completionOf(bookTests: Test[]): number {
    if (bookTests.length === 0) return 0;
    const done = bookTests.filter((t) => completedIds.has(t.id)).length;
    return Math.round((done / bookTests.length) * 100);
  }

  const selectBook = (book: string) => {
    setActiveBook(book);
    setDrawerOpen(false);
  };

  const sidebar = (
    <BookSidebar
      books={visibleBooks}
      currentBook={currentBook}
      onSelect={selectBook}
      search={search}
      onSearch={setSearch}
      filter={filter}
      onFilter={setFilter}
      testsFor={(book) => inCategory.filter((t) => bookOf(t) === book)}
      completionOf={completionOf}
    />
  );

  return (
    <div className="space-y-8">
      {/* ---------- header ---------- */}
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">
          {identityName ? `Welcome back, ${identityName}` : "Practice"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
          Work through a test one question at a time with instant feedback.
          Nothing here is graded or saved to the leaderboard — practise as often
          as you like.
        </p>
      </header>

      {/* ---------- your progress (all-time) ---------- */}
      <section aria-label="Your all-time progress" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your progress
          </h2>
          <span className="text-xs text-slate-400">
            All-time · practice doesn&apos;t change these
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard Icon={Flame} label="Current streak" value={`${stats.streak}d`} />
          <StatCard Icon={Star} label="Total XP" value={stats.xp} />
          <StatCard Icon={Target} label="Accuracy" value={`${stats.accuracy}%`} />
          <StatCard Icon={ListChecks} label="Questions" value={stats.questions} />
        </div>
      </section>

      {/* ---------- my vocabulary (saved words → drills) ---------- */}
      <MyVocabulary collections={collections} />

      {/* ---------- level navigation cards ---------- */}
      <section aria-label="Learning levels" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Levels
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((cat) => {
            const catTests = tests.filter((t) => categoryOf(t) === cat);
            const catBooks = orderBooks(cat, catTests.map(bookOf));
            const done = catTests.filter((t) => completedIds.has(t.id)).length;
            const completion =
              catTests.length > 0
                ? Math.round((done / catTests.length) * 100)
                : 0;
            return (
              <LevelCard
                key={cat}
                title={cat}
                Icon={LEVEL_ICON[cat]}
                books={catBooks.length}
                completion={completion}
                active={cat === category}
                onClick={() => {
                  setCategory(cat);
                  setActiveBook(null);
                  setFilter("All");
                  setSearch("");
                }}
              />
            );
          })}
        </div>
      </section>

      {/* ---------- sidebar + main ---------- */}
      {inCategory.length === 0 ? (
        <EmptyLevel category={category} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Desktop sidebar */}
          <div className="hidden lg:block">{sidebar}</div>

          {/* Mobile: open-drawer trigger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition active:scale-[0.99] lg:hidden"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="size-4 text-slate-400" />
              {currentBook ?? "Browse books"}
            </span>
            <ChevronRight className="size-4 text-slate-400" />
          </button>

          {/* Main content */}
          <main className="min-w-0">
            {currentBook ? (
              <BookDetail
                book={currentBook}
                category={category}
                tests={shown}
                completedIds={completedIds}
                completion={completionOf(shown)}
              />
            ) : (
              <ReadyState />
            )}
          </main>
        </div>
      )}

      {/* ---------- mobile drawer ---------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Books">
          <button
            type="button"
            aria-label="Close books menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] animate-in"
          />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-[#F8FAFC] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-lg font-semibold text-[#0F172A]">
                Books
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="flex size-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- my vocabulary ------------------------------- */

function MyVocabulary({
  collections,
}: {
  collections: { passageId: string; title: string; wordCount: number }[];
}) {
  return (
    <section aria-label="My vocabulary" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          My vocabulary
        </h2>
        <Link
          href="/lexora/vocab"
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Read &amp; collect →
        </Link>
      </div>

      {collections.length === 0 ? (
        <Link
          href="/lexora/vocab"
          className="group block focus-visible:outline-none"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-6 transition group-hover:border-brand-300 group-hover:bg-white">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[#0F172A]">
                No saved words yet
              </p>
              <p className="text-sm text-slate-600">
                Read a text in Vocabulary and double-tap words to practise them
                here.
              </p>
            </div>
            <ArrowRight className="ml-auto size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <Link
              key={c.passageId}
              href={`/practice/vocab/${c.passageId}`}
              className="group flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold leading-snug text-[#0F172A]">
                  {c.title}
                </h3>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Sparkles className="size-4" />
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {c.wordCount} saved {c.wordCount === 1 ? "word" : "words"}
                  {c.wordCount < 4 && " · need 4+"}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                  Practise
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------- stat card --------------------------------- */

function StatCard({
  Icon,
  label,
  value,
}: {
  Icon: typeof Sprout;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:hover:translate-y-0 sm:p-4">
      <div
        className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
        aria-hidden
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-3 font-display text-xl font-bold tabular-nums text-[#0F172A]">
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

/* --------------------------- level card -------------------------------- */

function LevelCard({
  title,
  Icon,
  books,
  completion,
  active,
  onClick,
}: {
  title: string;
  Icon: typeof Sprout;
  books: number;
  completion: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative flex flex-col rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0 ${
        active
          ? "border-brand-600 bg-brand-600 text-white shadow-card-hover"
          : "border-slate-200/70 bg-white text-[#0F172A] shadow-sm hover:-translate-y-0.5 hover:shadow-card-hover"
      }`}
    >
      <div
        className={`flex size-10 items-center justify-center rounded-2xl transition ${
          active
            ? "bg-white/15 text-white"
            : "bg-brand-50 text-brand-600 group-hover:bg-brand-100"
        }`}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-sm font-semibold leading-tight">{title}</p>
      <p className={`text-xs ${active ? "text-brand-100" : "text-slate-500"}`}>
        {books} book{books === 1 ? "" : "s"}
      </p>
      <div className="mt-3">
        <div
          className={`h-1.5 w-full overflow-hidden rounded-full ${
            active ? "bg-white/20" : "bg-slate-100"
          }`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              active ? "bg-white" : "bg-brand-600"
            }`}
            style={{ width: `${completion}%` }}
          />
        </div>
        <p
          className={`mt-1 text-right text-[11px] font-medium tabular-nums ${
            active ? "text-brand-100" : "text-slate-400"
          }`}
        >
          {completion}%
        </p>
      </div>
    </button>
  );
}

/* ---------------------------- sidebar ---------------------------------- */

function BookSidebar({
  books,
  currentBook,
  onSelect,
  search,
  onSearch,
  filter,
  onFilter,
  testsFor,
  completionOf,
}: {
  books: string[];
  currentBook: string | null;
  onSelect: (book: string) => void;
  search: string;
  onSearch: (v: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  testsFor: (book: string) => Test[];
  completionOf: (tests: Test[]) => number;
}) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search books..."
          aria-label="Search books"
          className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-[#0F172A] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onFilter(f)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-xs font-medium transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                active
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Book list */}
      {books.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          No books match your search.
        </p>
      ) : (
        <nav aria-label="Books" className="space-y-1.5">
          {books.map((book) => {
            const bookTests = testsFor(book);
            const completion = completionOf(bookTests);
            const active = book === currentBook;
            return (
              <button
                key={book}
                type="button"
                onClick={() => onSelect(book)}
                aria-current={active ? "page" : undefined}
                className={`group relative flex w-full flex-col gap-2 rounded-2xl px-3.5 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                  active
                    ? "bg-white shadow-card ring-1 ring-brand-600/20"
                    : "hover:bg-white hover:shadow-sm"
                }`}
              >
                {/* animated active indicator */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full bg-brand-600 transition-all duration-300 ${
                    active ? "w-1 opacity-100" : "w-0 opacity-0"
                  }`}
                />
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-xl transition ${
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600"
                    }`}
                  >
                    <BookOpen className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#0F172A]">
                    {book}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                    {completion}%
                  </span>
                </div>
                <ProgressBar
                  value={completion}
                  tone={completion >= 100 ? "success" : "brand"}
                />
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/* -------------------------- book detail -------------------------------- */

function BookDetail({
  book,
  category,
  tests,
  completedIds,
  completion,
}: {
  book: string;
  category: Category;
  tests: Test[];
  completedIds: Set<string>;
  completion: number;
}) {
  const totalQuestions = tests.reduce((s, t) => s + t.questions.length, 0);
  const estMinutes = Math.max(1, Math.round(totalQuestions * 0.5));
  const started = tests.some((t) => completedIds.has(t.id));
  const first = tests[0];

  return (
    <div className="space-y-6">
      {/* Book overview card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          {/* cover */}
          <div
            aria-hidden
            className="flex h-32 w-full shrink-0 items-center justify-center rounded-2xl bg-brand-600 ring-1 ring-inset ring-white/10 sm:h-36 sm:w-28"
          >
            <span className="font-display text-3xl font-bold text-white">
              {book
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-600/15">
                {category}
              </span>
              {completion >= 100 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-emerald-600/15">
                  <CheckCircle2 className="size-3" /> Completed
                </span>
              )}
            </div>
            <h2 className="mt-2 font-display text-xl font-bold text-[#0F172A]">
              {book}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {tests.length} test{tests.length === 1 ? "" : "s"} in this book.
              Practise each one as many times as you like.
            </p>

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Meta Icon={Target} label="Difficulty" value={category} />
              <Meta Icon={Clock} label="Est. time" value={`~${estMinutes} min`} />
              <Meta
                Icon={ListChecks}
                label="Questions"
                value={`${totalQuestions}`}
              />
            </dl>

            {first && (
              <LinkButton
                href={`/practice/${first.id}`}
                className="mt-5 gap-1.5 transition active:scale-[0.98]"
              >
                {started ? "Continue" : "Start practice"}
                <ArrowRight className="size-4" />
              </LinkButton>
            )}
          </div>
        </div>

        {/* completion strip */}
        <div className="border-t border-slate-100 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <ProgressBar
              value={completion}
              tone={completion >= 100 ? "success" : "brand"}
            />
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
              {completion}% complete
            </span>
          </div>
        </div>
      </div>

      {/* Question categories (tests) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Tests
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {tests.map((t) => (
            <TestCard key={t.id} test={t} done={completedIds.has(t.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Meta({
  Icon,
  label,
  value,
}: {
  Icon: typeof Target;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-slate-400" />
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium text-[#0F172A]">{value}</span>
    </div>
  );
}

function TestCard({ test, done }: { test: Test; done: boolean }) {
  return (
    <Link
      href={`/practice/${test.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold leading-snug text-[#0F172A]">
          {test.title}
        </h4>
        {done && (
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Completed" />
        )}
      </div>
      {test.description && (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {test.description}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {test.questions.length} question
          {test.questions.length === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
          Practise
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/* --------------------------- empty states ------------------------------ */

function ReadyState() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      <div
        aria-hidden
        className="flex size-20 items-center justify-center rounded-2xl bg-brand-50"
      >
        <BookOpen className="size-9 text-brand-600" />
      </div>
      <h2 className="mt-5 font-display text-xl font-bold text-[#0F172A]">
        Ready to practice?
      </h2>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-slate-600">
        Choose a book from the left to start learning.
      </p>
    </div>
  );
}

function EmptyLevel({ category }: { category: Category }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center">
      <div
        aria-hidden
        className="flex size-16 items-center justify-center rounded-2xl bg-slate-100"
      >
        <BookOpen className="size-8 text-slate-400" />
      </div>
      <h2 className="mt-4 font-display text-lg font-semibold text-[#0F172A]">
        No books in {category} yet
      </h2>
      <p className="mt-1.5 max-w-xs text-sm text-slate-600">
        New books added to this level will appear here.
      </p>
    </div>
  );
}
