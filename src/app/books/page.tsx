"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal, Sparkles } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { BookIcon } from "@/components/icons";
import { bookOf, categoryOf, useTests } from "@/lib/store";
import { CATEGORIES, orderBooks, type Category } from "@/lib/types";
import type { Test } from "@/lib/types";

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
          desc="Practise word sets — definitions, translations, and gap-fill."
        />
      </div>

      {byCategory.map(({ cat, books, count }) => (
        <CategorySection key={cat} cat={cat} books={books} count={count} />
      ))}
    </div>
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
