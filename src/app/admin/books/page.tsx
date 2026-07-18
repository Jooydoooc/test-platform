"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { deleteBook, listBooks } from "@/lib/books-client";
import {
  BOOK_CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  LEVEL_OPTIONS,
  isQuestionBook,
} from "@/lib/books";
import type { BookRow, Level } from "@/lib/database.types";

const LEVEL_LABEL: Record<Level, string> = Object.fromEntries(
  LEVEL_OPTIONS.map((l) => [l.value, l.label]),
) as Record<Level, string>;

export default function AdminBooksPage() {
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === "admin";

  const [books, setBooks] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(
    () =>
      BOOK_CONTENT_TYPES.map((ct) => ({
        ct,
        items: books.filter((b) => b.content_type === ct),
      })).filter((g) => g.items.length > 0),
    [books],
  );

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

  if (!sessionLoading && !isAdmin) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Managing units is available to admins only.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Admin
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Books &amp; units
          </h1>
          <p className="text-sm text-slate-600">
            Every uploaded unit, grouped by category. Delete here; students see a
            read-only catalog on Books.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <LinkButton href="/admin/books/import" variant="secondary">
            Bulk import
          </LinkButton>
          <LinkButton href="/author/upload">
            <span className="inline-flex items-center gap-1.5">
              <Upload className="size-4" /> Upload a unit
            </span>
          </LinkButton>
        </div>
      </div>

      {loading ? (
        <Card className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Loading units…
        </Card>
      ) : books.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No units uploaded yet.{" "}
            <Link href="/author/upload" className="font-semibold text-brand-600 underline">
              Upload the first one
            </Link>
            .
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ ct, items }) => (
            <section key={ct} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {CONTENT_TYPE_LABELS[ct]}
                </h2>
                <span className="text-xs text-slate-400">
                  {items.length} unit{items.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((b) => {
                  const questions = isQuestionBook(b.content_type);
                  return (
                    <Card
                      key={b.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
                          {questions ? (
                            <SlidersHorizontal className="size-4" />
                          ) : (
                            <BookOpen className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {b.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {questions ? "Drilling" : "Reading"}
                            {b.level ? ` · ${LEVEL_LABEL[b.level]}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <LinkButton
                          href={
                            questions
                              ? `/books/practice/${b.id}`
                              : `/books/read/${b.id}`
                          }
                          variant="secondary"
                          className="px-3"
                        >
                          {questions ? "Open" : "Read"}
                        </LinkButton>
                        <Button
                          variant="danger"
                          onClick={() => onDelete(b)}
                          disabled={deleting === b.id}
                          aria-label={`Delete ${b.title}`}
                          className="px-3"
                        >
                          {deleting === b.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
