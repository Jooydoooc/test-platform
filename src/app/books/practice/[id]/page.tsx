"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, ListChecks } from "lucide-react";
import { QuestionRunner } from "@/components/QuestionRunner";
import { getBookAsTestWithPassages } from "@/lib/books-client";
import type { Test } from "@/lib/types";
import type { BookPassageRow } from "@/lib/database.types";

// Split a passage body into paragraphs on blank lines. Mirrors the reader's
// splitParagraphs (src/app/books/read/[id]/page.tsx) so passage rendering
// stays visually consistent between the two pages; kept local here since
// that page doesn't export the helper.
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

type Mobile = "read" | "answer";

// Practise an uploaded book's questions through the shared QuestionRunner.
// For comprehension books (Guardian Articles: SHORT_ANSWER/MULTIPLE_CHOICE/
// TRUE_FALSE questions about a passage) the passage is rendered alongside the
// runner so the student can re-read while answering, instead of having to
// answer from memory. Question-only books (Grammar/Vocabulary/Reading
// uploads with no book_passages row) render exactly as before — QuestionRunner
// alone, no empty panel, no layout shift.
export default function BookPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<Test | null>(null);
  const [passages, setPassages] = useState<BookPassageRow[]>([]);
  const [passagesError, setPassagesError] = useState(false);
  const [mobileView, setMobileView] = useState<Mobile>("read");

  useEffect(() => {
    let active = true;
    getBookAsTestWithPassages(id)
      .then((result) => {
        if (!active) return;
        if (!result || result.test.questions.length === 0) {
          router.replace("/books");
          return;
        }
        setTest(result.test);
        setPassages(result.passages);
        setPassagesError(result.passagesError);
      })
      .catch(() => router.replace("/books"));
    return () => {
      active = false;
    };
  }, [id, router]);

  const passage = passages[0];
  const paragraphs = useMemo(
    () => (passage ? splitParagraphs(passage.body) : []),
    [passage],
  );

  if (!test) return <p className="text-slate-500">Loading…</p>;

  // Question-only book (no passage row), OR the passage failed to load —
  // either way there's no article to show alongside the questions. When it
  // failed (rather than genuinely not existing) say so, but keep the
  // questions answerable: the student's practice attempt shouldn't be
  // blocked by an article that wouldn't have been graded anyway.
  if (!passage) {
    return (
      <div>
        {passagesError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              We couldn’t load the article text for this practice set. You can still
              answer the questions below.
            </span>
          </div>
        )}
        <QuestionRunner test={test} mode="practice" subtitle="Uploaded book" />
      </div>
    );
  }

  return (
    <div>
      {/* Mobile/tablet mode switch — hidden at lg, where both panes show
          side by side. A plain button pair (not ARIA tabs: this control has
          no tabpanel-switching keyboard model implemented, so it doesn't
          claim role="tab"/"tablist") that flips which pane is visible. */}
      <div
        role="group"
        aria-label="Practice view"
        className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 lg:hidden"
      >
        <button
          type="button"
          aria-pressed={mobileView === "read"}
          onClick={() => setMobileView("read")}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
            mobileView === "read"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookOpen className="size-4" aria-hidden="true" />
          Read the article
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "answer"}
          onClick={() => setMobileView("answer")}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
            mobileView === "answer"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <ListChecks className="size-4" aria-hidden="true" />
          Questions
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <section
          className={`rounded-xl border border-slate-200/80 bg-white p-5 shadow-card lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto ${
            mobileView === "read" ? "block" : "hidden"
          }`}
        >
          <p className="mb-3 text-sm font-medium text-slate-500">
            Reference passage — read only
          </p>
          {passage.title && (
            <h2 className="mb-4 text-xl font-bold leading-tight text-slate-900">
              {passage.title}
            </h2>
          )}
          <div className="max-w-[70ch] text-[17px] leading-8 text-slate-800">
            {paragraphs.map((paragraph, pIdx) => (
              <p key={pIdx} className={pIdx > 0 ? "mt-5" : undefined}>
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        <section
          className={`min-w-0 lg:block ${mobileView === "answer" ? "block" : "hidden"}`}
        >
          <QuestionRunner test={test} mode="practice" subtitle="Uploaded book" />
        </section>
      </div>
    </div>
  );
}
