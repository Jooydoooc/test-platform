"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Loader2, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { BookIcon } from "@/components/icons";
import { useSession } from "@/lib/auth";
import { bookOf, categoryOf, useTests } from "@/lib/store";
import { CATEGORIES, orderBooks, type Category } from "@/lib/types";
import type { Test } from "@/lib/types";
import { deleteBook, listBooks } from "@/lib/books-client";
import { vocabUnitIdForTest } from "@/lib/vocab-store";
import {
  BOOK_CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  isQuestionBook,
} from "@/lib/books";
import type { BookRow } from "@/lib/database.types";

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

// Books uploaded by admins (Supabase), grouped by content category. Hidden when
// there are none or Supabase isn't configured.
function UploadedBooks() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const [books, setBooks] = useState<BookRow[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);

  async function onDelete(b: BookRow) {
    if (deleting) return;
    if (!window.confirm(`Delete "${b.title}"? This can't be undone.`)) return;
    setDeleting(b.id);
    const res = await deleteBook(b.id);
    setDeleting(null);
    if (res.ok) {
      setBooks((prev) => prev.filter((x) => x.id !== b.id));
    } else {
      window.alert(res.error ?? "Could not delete this unit.");
    }
  }

  if (books.length === 0) return null;

  const groups = BOOK_CONTENT_TYPES.map((ct) => ({
    ct,
    items: books.filter((b) => b.content_type === ct),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">Uploaded units</h2>
      {groups.map(({ ct, items }) => (
        <div key={ct} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {CONTENT_TYPE_LABELS[ct]}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((b) => {
              const questions = isQuestionBook(b.content_type);
              return (
                <div key={b.id} className="group relative">
                  <Link
                    href={questions ? `/books/practice/${b.id}` : `/books/read/${b.id}`}
                    className="block focus-visible:outline-none"
                  >
                    <Card className="flex h-full items-center justify-between gap-3 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-card-hover">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
                          {questions ? (
                            <SlidersHorizontal className="size-4" />
                          ) : (
                            <BookOpen className="size-4" />
                          )}
                        </span>
                        <p className="min-w-0 truncate font-semibold text-slate-900">
                          {b.title}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600">
                        {questions ? "Practise" : "Read"}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Card>
                  </Link>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onDelete(b)}
                      disabled={deleting === b.id}
                      aria-label={`Delete ${b.title}`}
                      title="Delete unit"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-slate-400 opacity-0 ring-1 ring-inset ring-slate-200 transition hover:text-red-600 hover:ring-red-200 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100"
                    >
                      {deleting === b.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
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
