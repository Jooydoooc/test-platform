"use client";

import { useMemo, useState } from "react";
import { Card, LinkButton } from "@/components/ui";
import { bookOf, categoryOf, useTests } from "@/lib/store";
import { CATEGORIES, DEFAULT_CATEGORY, orderBooks, type Category } from "@/lib/types";

export default function PracticePage() {
  const tests = useTests().filter((t) => t.questions.length > 0);

  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [activeBook, setActiveBook] = useState<string | null>(null);
  const [booksOpen, setBooksOpen] = useState(true);

  // Tests in the selected category, and the books they span (Essential 1 first).
  const inCategory = useMemo(
    () => tests.filter((t) => categoryOf(t) === category),
    [tests, category],
  );
  const books = useMemo(
    () => orderBooks(category, inCategory.map(bookOf)),
    [inCategory, category],
  );

  // Resolve the active book: keep the chosen one if still present, else first.
  const currentBook =
    activeBook && books.includes(activeBook) ? activeBook : (books[0] ?? null);

  const shown = inCategory.filter((t) => bookOf(t) === currentBook);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Practice</h1>
        <p className="text-sm text-slate-600">
          Work through a test one question at a time with instant feedback.
          Nothing here is graded or saved to the leaderboard — practise as often
          as you like.
        </p>
      </div>

      {/* Category menu bar */}
      <nav
        aria-label="Levels"
        className="flex gap-2 overflow-x-auto rounded-lg bg-slate-100 p-1"
      >
        {CATEGORIES.map((cat) => {
          const count = tests.filter((t) => categoryOf(t) === cat).length;
          const isActive = cat === category;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setCategory(cat);
                setActiveBook(null);
              }}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {cat}
              <span className="ml-1.5 text-xs text-slate-400">{count}</span>
            </button>
          );
        })}
      </nav>

      {inCategory.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No practice tests in <span className="font-medium">{category}</span>{" "}
            yet. New books added to this level will appear here.
          </p>
        </Card>
      ) : (
        <div className="flex gap-4">
          {/* Sandwich (hamburger) toggle for the books menu */}
          <button
            type="button"
            onClick={() => setBooksOpen((v) => !v)}
            aria-expanded={booksOpen}
            aria-controls="books-menu"
            aria-label={booksOpen ? "Hide books menu" : "Show books menu"}
            className="h-9 w-9 shrink-0 rounded-md border border-slate-200 text-slate-700 transition hover:bg-slate-50"
          >
            <span className="mx-auto flex h-4 w-5 flex-col justify-between">
              <span className="h-0.5 w-full rounded bg-current" />
              <span className="h-0.5 w-full rounded bg-current" />
              <span className="h-0.5 w-full rounded bg-current" />
            </span>
          </button>

          {/* Left-side vertical books menu */}
          {booksOpen && (
            <nav
              id="books-menu"
              aria-label="Books"
              className="w-52 shrink-0 space-y-1 border-r border-slate-200 pr-2"
            >
              {books.map((book) => {
                const count = inCategory.filter(
                  (t) => bookOf(t) === book,
                ).length;
                const isActive = book === currentBook;
                return (
                  <button
                    key={book}
                    type="button"
                    onClick={() => setActiveBook(book)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                      isActive
                        ? "bg-brand-600 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="truncate">{book}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Tests for the active book */}
          <div className="min-w-0 flex-1">
            <div className="grid gap-3 sm:grid-cols-2">
              {shown.map((t) => (
                <Card key={t.id} className="flex flex-col gap-3">
                  <div>
                    <h3 className="font-semibold">{t.title}</h3>
                    {t.description && (
                      <p className="mt-1 text-sm text-slate-600">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {t.questions.length} question
                    {t.questions.length === 1 ? "" : "s"}
                  </p>
                  <LinkButton href={`/practice/${t.id}`}>Practise →</LinkButton>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
