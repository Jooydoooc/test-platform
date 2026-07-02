"use client";

import { useMemo } from "react";
import { Card, LinkButton } from "@/components/ui";
import { bookOf, categoryOf, useTests } from "@/lib/store";
import { CATEGORIES, orderBooks, type Category } from "@/lib/types";
import type { Test } from "@/lib/types";

export default function BooksPage() {
  const tests = useTests().filter((t) => t.questions.length > 0);

  // category -> ordered books -> tests
  const byCategory = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const inCat = tests.filter((t) => categoryOf(t) === cat);
      const books = orderBooks(cat, inCat.map(bookOf)).map((book) => ({
        book,
        tests: inCat.filter((t) => bookOf(t) === book),
      }));
      return { cat, books, count: inCat.length };
    });
  }, [tests]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Books</h1>
        <p className="text-sm text-slate-600">
          Browse every book by level. Open a unit to practise its questions.
        </p>
      </div>

      {byCategory.map(({ cat, books, count }) => (
        <CategorySection key={cat} cat={cat} books={books} count={count} />
      ))}
    </div>
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
        <Card>
          <p className="text-sm text-slate-500">No books in this level yet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {books.map(({ book, tests }) => (
            <Card key={book} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">📘 {book}</h3>
                <span className="text-xs text-slate-500">
                  {tests.length} {tests.length === 1 ? "unit" : "units"}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {tests.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {t.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.questions.length} question
                        {t.questions.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <LinkButton
                        href={`/practice/${t.id}`}
                        variant="secondary"
                        className="px-3"
                      >
                        Practise
                      </LinkButton>
                      <LinkButton
                        href={`/tests/${t.id}`}
                        className="px-3"
                      >
                        Take
                      </LinkButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
