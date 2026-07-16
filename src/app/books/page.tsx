"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Badge, Card, LinkButton, inputClass } from "@/components/ui";
import { BookIcon } from "@/components/icons";
import { bookOf, categoryOf, useTests } from "@/lib/store";
import { CATEGORIES, orderBooks, type Category } from "@/lib/types";
import type { Test } from "@/lib/types";
import { listBooks } from "@/lib/books-client";
import { vocabUnitIdForTest } from "@/lib/vocab-store";
import {
  BOOK_CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  LEVEL_OPTIONS,
  isQuestionBook,
} from "@/lib/books";
import type { BookContentType, BookRow, Level } from "@/lib/database.types";

// Level display order (matches the upload form) with a trailing bucket for
// units saved without a level.
const LEVEL_ORDER: (Level | null)[] = [...LEVEL_OPTIONS.map((l) => l.value), null];
const LEVEL_LABEL = Object.fromEntries(
  LEVEL_OPTIONS.map((l) => [l.value, l.label]),
) as Record<Level, string>;

export default function BooksPage() {
  const tests = useTests().filter((t) => t.questions.length > 0);

  // category -> ordered books -> tests
  const byCategory = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const inCat = tests.filter((t) => categoryOf(t) === cat);
      const books = orderBooks(cat, inCat.map(bookOf))
        .map((book) => ({
          book,
          tests: inCat.filter((t) => bookOf(t) === book),
        }))
        // Only show books that actually have units; empty catalog entries
        // would otherwise render as hollow cards.
        .filter((b) => b.tests.length > 0);
      return { cat, books, count: inCat.length };
    });
  }, [tests]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Books</h1>
        <p className="text-sm text-slate-600">
          Browse every book by level. Open a unit to practise its questions.
        </p>
      </div>

      {/* Practice + Vocabulary live here (not in the top nav). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <QuickCard
          href="/practice"
          icon={<SlidersHorizontal className="size-5" />}
          title="Practice"
          desc="Work through exercises one at a time with instant feedback."
        />
        <QuickCard
          href="/lexora/vocab"
          icon={<Sparkles className="size-5" />}
          title="Vocabulary"
          desc="Read texts and double-tap words to save and learn them."
        />
      </div>

      <UploadedBooks />

      {byCategory.map(({ cat, books, count }) => (
        <CategorySection key={cat} cat={cat} books={books} count={count} />
      ))}
    </div>
  );
}

// Books uploaded by admins (Supabase). Because a category can hold many units,
// they're searchable, filterable by category, collapsible, and sub-grouped by
// level so the list stays scannable as the catalog grows. Hidden when empty.
function UploadedBooks() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<BookContentType | "ALL">("ALL");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);

  const q = query.trim().toLowerCase();

  // Categories that actually have units — drives the filter chips.
  const presentCats = useMemo(
    () => BOOK_CONTENT_TYPES.filter((ct) => books.some((b) => b.content_type === ct)),
    [books],
  );

  // Category → matching units (after search + category filter), non-empty only.
  const groups = useMemo(() => {
    const matches = q
      ? books.filter((b) => b.title.toLowerCase().includes(q))
      : books;
    return BOOK_CONTENT_TYPES.filter(
      (ct) => activeCat === "ALL" || ct === activeCat,
    )
      .map((ct) => ({ ct, items: matches.filter((b) => b.content_type === ct) }))
      .filter((g) => g.items.length > 0);
  }, [books, q, activeCat]);

  function toggle(ct: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ct)) next.delete(ct);
      else next.add(ct);
      return next;
    });
  }

  if (books.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Uploaded units</h2>
        <span className="text-xs text-slate-500">
          {books.length} unit{books.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search units by title…"
          className={`${inputClass} pl-9`}
          aria-label="Search uploaded units"
        />
      </div>

      {presentCats.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={activeCat === "ALL"} onClick={() => setActiveCat("ALL")}>
            All
          </FilterChip>
          {presentCats.map((ct) => (
            <FilterChip
              key={ct}
              active={activeCat === ct}
              onClick={() => setActiveCat(ct)}
            >
              {CONTENT_TYPE_LABELS[ct]}
            </FilterChip>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
          No units match “{query}”.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ ct, items }) => {
            const isCollapsed = collapsed.has(ct);
            const byLevel = LEVEL_ORDER.map((lv) => ({
              lv,
              rows: items.filter((b) => (b.level ?? null) === lv),
            })).filter((g) => g.rows.length > 0);
            const showLevelLabels = byLevel.length > 1 || byLevel[0]?.lv != null;

            return (
              <Card key={ct} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => toggle(ct)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {CONTENT_TYPE_LABELS[ct]}
                    </h3>
                    <Badge tone="neutral">{items.length}</Badge>
                  </span>
                  <ChevronDown
                    className={`size-4 text-slate-400 transition-transform ${
                      isCollapsed ? "" : "rotate-180"
                    }`}
                  />
                </button>

                {!isCollapsed && (
                  <div className="space-y-4 px-4 pb-4 pt-1">
                    {byLevel.map(({ lv, rows }) => (
                      <div key={String(lv)} className="space-y-1.5">
                        {showLevelLabels && (
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            {lv ? LEVEL_LABEL[lv] : "No level"}
                          </p>
                        )}
                        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                          {rows.map((b) => (
                            <UnitRow key={b.id} book={b} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function UnitRow({ book }: { book: BookRow }) {
  const questions = isQuestionBook(book.content_type);
  return (
    <li>
      <Link
        href={questions ? `/books/practice/${book.id}` : `/books/read/${book.id}`}
        className="group flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
            {questions ? (
              <SlidersHorizontal className="size-4" />
            ) : (
              <BookOpen className="size-4" />
            )}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-slate-800">
            {book.title}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600">
          {questions ? "Practise" : "Read"}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function QuickCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card className="flex h-full items-center gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover group-focus-visible:border-brand-400 group-focus-visible:ring-2 group-focus-visible:ring-brand-500/30">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{desc}</p>
        </div>
        <ArrowRight className="size-5 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" />
      </Card>
    </Link>
  );
}

function CategorySection({
  cat,
  books,
  count,
}: {
  cat: Category;
  books: { book: string; tests: Test[] }[];
  count: number;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">{cat}</h2>
        <span className="text-xs text-slate-500">
          {count} {count === 1 ? "test" : "tests"}
        </span>
      </div>

      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
          No books in this level yet.
        </div>
      ) : (
        <div className="space-y-4">
          {books.map(({ book, tests }) => (
            <Card key={book} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
                    <BookIcon width={16} height={16} />
                  </span>
                  {book}
                </h3>
                <span className="text-xs text-slate-500">
                  {tests.length} {tests.length === 1 ? "unit" : "units"}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {tests.map((t) => {
                  // Vocabulary units open the full 8-exercise hub (translation,
                  // definition, gap-fill, matching…); other units keep the
                  // single-run practice.
                  const vocabId = vocabUnitIdForTest(t.id);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {t.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {vocabId
                            ? "8 exercises · skills test"
                            : `${t.questions.length} question${
                                t.questions.length === 1 ? "" : "s"
                              }`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {vocabId ? (
                          <>
                            {/* Two things per vocab set: practice exercises (no XP)
                                and the graded skills test (earns XP). */}
                            <LinkButton
                              href={`/practice/vocab/${vocabId}`}
                              variant="secondary"
                              className="px-3"
                            >
                              Exercises
                            </LinkButton>
                            <LinkButton
                              href={`/practice/vocab/${vocabId}/test`}
                              className="px-3"
                            >
                              Test
                            </LinkButton>
                          </>
                        ) : (
                          <LinkButton href={`/practice/${t.id}`} className="px-4">
                            Practise
                          </LinkButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
