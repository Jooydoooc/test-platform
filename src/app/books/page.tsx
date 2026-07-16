"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  GraduationCap,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Badge, Card, LinkButton, inputClass } from "@/components/ui";
import { categoryOf, useTests } from "@/lib/store";
import { CATEGORIES, type Category } from "@/lib/types";
import { listBooks } from "@/lib/books-client";
import { vocabUnitIdForTest } from "@/lib/vocab-store";
import { CONTENT_TYPE_LABELS, LEVEL_OPTIONS, isQuestionBook } from "@/lib/books";
import type { BookRow, Level } from "@/lib/database.types";

// Uploaded units store their level as an enum; the demo tests use the same set
// of human labels (Beginner … IELTS Graduation) as their category, so a single
// level axis unifies both. Items without a level fall into a trailing bucket.
const NO_LEVEL = "No level";
type LevelBucket = Category | typeof NO_LEVEL;
const LEVEL_ORDER: LevelBucket[] = [...CATEGORIES, NO_LEVEL];
const LEVEL_ENUM_LABEL = Object.fromEntries(
  LEVEL_OPTIONS.map((l) => [l.value, l.label]),
) as Record<Level, Category>;

// A normalized catalog entry — either an admin-uploaded unit or a demo test.
type CatalogItem = {
  key: string;
  title: string;
  level: LevelBucket;
  typeLabel: string; // drives the filter chips
  icon: "vocab" | "question" | "read";
  actions: { href: string; label: string; primary?: boolean }[];
};

// Order the type chips predictably; only those actually present are shown.
const TYPE_ORDER = [
  "Vocabulary",
  "Grammar",
  "Reading",
  "Articles",
  "Practice test",
];

export default function BooksPage() {
  const tests = useTests().filter((t) => t.questions.length > 0);
  const [books, setBooks] = useState<BookRow[]>([]);

  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);

  const items = useMemo<CatalogItem[]>(() => {
    const uploaded: CatalogItem[] = books.map((b) => {
      const questions = isQuestionBook(b.content_type);
      return {
        key: `book-${b.id}`,
        title: b.title,
        level: b.level ? LEVEL_ENUM_LABEL[b.level] : NO_LEVEL,
        typeLabel: CONTENT_TYPE_LABELS[b.content_type],
        icon: questions ? "question" : "read",
        actions: [
          questions
            ? { href: `/books/practice/${b.id}`, label: "Practise", primary: true }
            : { href: `/books/read/${b.id}`, label: "Read", primary: true },
        ],
      };
    });

    const demo: CatalogItem[] = tests.map((t) => {
      const vocabId = vocabUnitIdForTest(t.id);
      if (vocabId) {
        return {
          key: `test-${t.id}`,
          title: t.title,
          level: categoryOf(t),
          typeLabel: "Vocabulary",
          icon: "vocab",
          actions: [
            { href: `/practice/vocab/${vocabId}`, label: "Exercises" },
            { href: `/practice/vocab/${vocabId}/test`, label: "Test", primary: true },
          ],
        };
      }
      return {
        key: `test-${t.id}`,
        title: t.title,
        level: categoryOf(t),
        typeLabel: "Practice test",
        icon: "question",
        actions: [{ href: `/practice/${t.id}`, label: "Practise", primary: true }],
      };
    });

    return [...uploaded, ...demo];
  }, [books, tests]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Books</h1>
        <p className="text-sm text-slate-600">
          Every unit and test, grouped by level. Search or filter to find one.
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

      <Catalog items={items} />
    </div>
  );
}

function Catalog({ items }: { items: CatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<string>("All");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();

  const presentTypes = useMemo(
    () => TYPE_ORDER.filter((t) => items.some((i) => i.typeLabel === t)),
    [items],
  );

  // Level bucket → matching items (after search + type filter), non-empty only.
  const groups = useMemo(() => {
    const matches = items.filter(
      (i) =>
        (activeType === "All" || i.typeLabel === activeType) &&
        (!q || i.title.toLowerCase().includes(q)),
    );
    return LEVEL_ORDER.map((level) => ({
      level,
      rows: matches
        .filter((i) => i.level === level)
        .sort(
          (a, b) =>
            TYPE_ORDER.indexOf(a.typeLabel) - TYPE_ORDER.indexOf(b.typeLabel) ||
            a.title.localeCompare(b.title),
        ),
    })).filter((g) => g.rows.length > 0);
  }, [items, q, activeType]);

  function toggle(level: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Catalog</h2>
        <span className="text-xs text-slate-500">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title…"
          className={`${inputClass} pl-9`}
          aria-label="Search catalog"
        />
      </div>

      {presentTypes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={activeType === "All"} onClick={() => setActiveType("All")}>
            All
          </FilterChip>
          {presentTypes.map((t) => (
            <FilterChip
              key={t}
              active={activeType === t}
              onClick={() => setActiveType(t)}
            >
              {t}
            </FilterChip>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
          Nothing matches your search.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ level, rows }) => {
            const isCollapsed = collapsed.has(level);
            return (
              <Card key={level} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => toggle(level)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
                      <GraduationCap className="size-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">{level}</h3>
                    <Badge tone="neutral">{rows.length}</Badge>
                  </span>
                  <ChevronDown
                    className={`size-4 text-slate-400 transition-transform ${
                      isCollapsed ? "" : "rotate-180"
                    }`}
                  />
                </button>

                {!isCollapsed && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {rows.map((item) => (
                      <CatalogRow key={item.key} item={item} />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CatalogRow({ item }: { item: CatalogItem }) {
  const Icon =
    item.icon === "vocab" ? Sparkles : item.icon === "read" ? BookOpen : SlidersHorizontal;
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">
            {item.title}
          </span>
          <span className="text-xs text-slate-500">{item.typeLabel}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {item.actions.map((a) =>
          a.primary ? (
            <LinkButton key={a.href} href={a.href} className="px-3">
              {a.label}
            </LinkButton>
          ) : (
            <LinkButton key={a.href} href={a.href} variant="secondary" className="px-3">
              {a.label}
            </LinkButton>
          ),
        )}
      </span>
    </li>
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
