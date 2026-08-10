"use client";

import {
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, LinkButton } from "@/components/ui";
import { getBookForRead, type BookForRead } from "@/lib/books-client";
import { CONTENT_TYPE_LABELS } from "@/lib/books";
import {
  addExternalWord,
  getCollectedEntries,
  normalizeWord,
  removeCollectedWord,
} from "@/lib/vocab-store";
import { buildGlossaryIndex, lemmaKey, matchWord } from "@/lib/glossary-match";
import type { BookGlossaryRow } from "@/lib/database.types";

const MIN_TO_PRACTISE = 4;

// Split a passage body into paragraphs on blank lines. 48/50 imported Guardian
// passages carry \n\n breaks; the other 2 have none and this returns them as
// a single paragraph, unchanged from the old single-<p> rendering.
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Some passages open with a short one-line headline before the body proper.
// Conservative on purpose: only treated as a heading when it's a single line
// (no internal newline), short, and there's a real body paragraph after it —
// otherwise a short-but-normal first paragraph would get mangled.
function splitHeadline(paragraphs: string[]): { headline: string | null; body: string[] } {
  if (paragraphs.length < 2) return { headline: null, body: paragraphs };
  const first = paragraphs[0];
  const wordCount = first.split(/\s+/).filter(Boolean).length;
  const looksLikeHeadline = !first.includes("\n") && wordCount <= 12 && first.length <= 90;
  return looksLikeHeadline
    ? { headline: first, body: paragraphs.slice(1) }
    : { headline: null, body: paragraphs };
}

function tokenize(paragraph: string): string[] {
  return paragraph.match(/[A-Za-z']+|[^A-Za-z']+/g) ?? [];
}

type OpenPopover = {
  instanceKey: string;
  wordKey: string; // lemma key (normalizeWord(row.word)) — what gets saved
  row: BookGlossaryRow;
  anchor: HTMLElement;
  openedVia: "keyboard" | "pointer";
};

type PopoverPos = { top: number; left: number };

const POPOVER_WIDTH = 320;
const POPOVER_MARGIN = 12;

// Read an uploaded Reading/Articles book. Tapping a highlighted word opens a
// popover with its definition/translation/example; the Save button inside it
// is the only way to collect the word, so the student always sees what
// they're saving before they save it.
export default function BookReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<BookForRead | null | "missing">(null);
  const [collected, setCollected] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [popover, setPopover] = useState<OpenPopover | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPos | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // instanceKey of the popover we've already repositioned using its real
  // (measured) height, so the mount-time remeasure below only fires once per
  // open rather than looping.
  const measuredForRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    getBookForRead(id)
      .then((d) => {
        if (!active) return;
        if (!d) {
          setData("missing");
          return;
        }
        setData(d);
        setCollected(getCollectedEntries(id).map((e) => e.wordKey));
      })
      .catch(() => setData("missing"));
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (data === "missing") router.replace("/books");
  }, [data, router]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);

  const glossaryIndex = useMemo(() => {
    if (!data || data === "missing") return null;
    return buildGlossaryIndex(data.glossary);
  }, [data]);

  // Plain lemma -> row lookup for the Saved sidebar and the popover's save
  // toggle, where we already have the lemma key and just need its data.
  const lemmaMap = useMemo(() => {
    const m = new Map<string, BookGlossaryRow>();
    if (data && data !== "missing") {
      for (const g of data.glossary) m.set(lemmaKey(g), g);
    }
    return m;
  }, [data]);

  const body =
    data && data !== "missing" ? (data.passages[0]?.body ?? "") : "";
  const paragraphs = useMemo(() => splitParagraphs(body), [body]);
  const { headline, body: bodyParagraphs } = useMemo(
    () => splitHeadline(paragraphs),
    [paragraphs],
  );

  function closePopover() {
    const restoreTo = restoreFocusRef.current;
    setPopover(null);
    setPopoverPos(null);
    restoreTo?.focus();
  }

  function openPopoverFor(
    instanceKey: string,
    row: BookGlossaryRow,
    anchor: HTMLElement,
    via: "keyboard" | "pointer",
  ) {
    if (popover && popover.instanceKey === instanceKey) {
      closePopover();
      return;
    }
    restoreFocusRef.current = anchor;
    setPopover({ instanceKey, wordKey: lemmaKey(row), row, anchor, openedVia: via });
  }

  function computePosition(anchor: HTMLElement): PopoverPos {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - POPOVER_MARGIN * 2);
    // Before the popover has ever painted this open, offsetHeight is 0/absent
    // and we fall back to an estimate; attachPopoverRef below fires a
    // remeasure with the real height as soon as the node mounts. The card's
    // own max-height (see render) also caps this so a genuinely huge entry
    // never asks for more vertical space than the viewport has.
    const height = popoverRef.current?.offsetHeight || 220;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(
      POPOVER_MARGIN,
      Math.min(left, window.innerWidth - width - POPOVER_MARGIN),
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < height + 16 && rect.top > height + 16;
    let top = placeAbove ? rect.top - height - 8 : rect.bottom + 8;
    // Clamp both edges: without the bottom half of this, a tall card (long
    // definition + example, or a short viewport) could render past the
    // bottom of the screen with its Save button unreachable.
    top = Math.max(
      POPOVER_MARGIN,
      Math.min(top, window.innerHeight - POPOVER_MARGIN - height),
    );
    return { top, left };
  }

  // Position using an estimated height (first paint, nothing measured yet).
  useLayoutEffect(() => {
    if (!popover) return;
    measuredForRef.current = null;
    setPopoverPos(computePosition(popover.anchor));
  }, [popover]);

  // Once the popover has actually mounted and has a real offsetHeight, redo
  // the placement/flip decision against that real height instead of the
  // estimate. Runs in the ref callback (attachPopoverRef) rather than an
  // effect keyed on `popover`, because that's the earliest point the node
  // exists — an effect on [popover] fires before the node backing
  // popoverPos's *own* update has mounted. Guarded by measuredForRef so it
  // fires exactly once per open, not on every render.
  // Focus moves in here too, for the same reason: the dialog isn't mounted on
  // the commit where `popover` changes, so an effect keyed on [popover] would
  // run while popoverRef is still null and focus would stay on the word —
  // leaving a keyboard user outside an open dialog, able to tab past it.
  function attachPopoverRef(el: HTMLDivElement | null) {
    popoverRef.current = el;
    if (el && popover && measuredForRef.current !== popover.instanceKey) {
      measuredForRef.current = popover.instanceKey;
      setPopoverPos(computePosition(popover.anchor));
      // Only when opened via keyboard; a tap leaves focus where the browser
      // already put it.
      if (popover.openedVia === "keyboard") {
        el.querySelector<HTMLElement>("button, [tabindex]")?.focus();
      }
    }
  }

  // Escape to close, Tab/Shift+Tab trapped inside the popover.
  useEffect(() => {
    if (!popover) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePopover();
        return;
      }
      if (e.key !== "Tab") return;
      const container = popoverRef.current;
      if (!container) return;
      const focusables = container.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover]);

  // Outside click closes it.
  useEffect(() => {
    if (!popover) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (popover?.anchor === target || popover?.anchor.contains(target)) return;
      closePopover();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover]);

  // Reposition on scroll/resize; close outright if the anchor scrolls fully
  // out of view (the popover would otherwise detach from its word).
  useEffect(() => {
    if (!popover) return;
    const anchor = popover.anchor;
    const onScroll = () => setPopoverPos(computePosition(anchor));
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) closePopover();
      },
      { threshold: 0 },
    );
    observer.observe(anchor);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popover]);

  if (!data || data === "missing" || !glossaryIndex) {
    return <p className="text-slate-500">Loading…</p>;
  }

  const book = data.book;
  // A failed query is not the same as an empty result: say so rather than
  // presenting an outage as "this book simply has no glossary/questions".
  const glossaryFailed = data.glossaryError === true;
  const passageFailed = data.passagesError === true;
  const questionsFailed = data.questionCountError === true;
  const hasGlossary = data.glossary.length > 0;
  const hasQuestions = data.questionCount > 0;
  const collectedSet = new Set(collected);
  const canPractise = collected.length >= MIN_TO_PRACTISE;

  function toggleSave(row: BookGlossaryRow) {
    const key = lemmaKey(row);
    if (!key) return;
    setCollected((prev) => {
      if (prev.includes(key)) {
        removeCollectedWord(id, key);
        setFlash(`Removed “${row.word}”`);
        return prev.filter((k) => k !== key);
      }
      addExternalWord(id, book.title, {
        word: row.word,
        definition_en: row.definition_en,
        translation_uz: row.translation_uz,
        example: row.example,
        part_of_speech: row.part_of_speech,
      });
      setFlash(`Saved “${row.word}”`);
      return [...prev, key];
    });
  }

  function removeSaved(key: string) {
    removeCollectedWord(id, key);
    setCollected((prev) => prev.filter((k) => k !== key));
  }

  let tokenSeq = 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">
          {CONTENT_TYPE_LABELS[book.content_type]}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {book.title}
        </h1>
        <p className="text-sm text-slate-600">
          {passageFailed ? (
            "The article text couldn’t be loaded, so there’s nothing to read yet."
          ) : hasGlossary ? (
            <>
              Tap a{" "}
              <span className="underline decoration-dotted decoration-brand-400 underline-offset-4">
                highlighted
              </span>{" "}
              word to see its meaning and save it.
            </>
          ) : glossaryFailed ? (
            "We couldn’t load the glossary for this article — refresh to try again."
          ) : (
            "This book has no glossary, so it’s for reading only."
          )}
        </p>
      </header>

      {(passageFailed || questionsFailed) && (
        <Card
          role="alert"
          className="flex items-start gap-2 border-amber-200 bg-amber-50 text-sm text-amber-900"
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {passageFailed
              ? "We couldn’t load the text of this article. Refresh to try again."
              : "We couldn’t check whether this article has comprehension questions."}
          </span>
        </Card>
      )}

      {questionsFailed && !hasQuestions && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-slate-600">
            If this article has comprehension questions, you can still open them.
          </p>
          <LinkButton
            href={`/books/practice/${id}`}
            variant="secondary"
            className="shrink-0 gap-1.5"
          >
            Practise
            <ArrowRight className="size-4" />
          </LinkButton>
        </Card>
      )}

      {hasQuestions && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-brand-200 bg-brand-50/40">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Comprehension questions</p>
            <p className="text-sm text-slate-600">
              {data.questionCount} question{data.questionCount === 1 ? "" : "s"} on this
              passage.
            </p>
          </div>
          <LinkButton href={`/books/practice/${id}`} className="shrink-0 gap-1.5">
            Practise
            <ArrowRight className="size-4" />
          </LinkButton>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="text-[17px] leading-9 text-slate-800">
          {hasGlossary && (
            <a
              href="#after-passage"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-slate-900 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
            >
              Skip past highlighted words
            </a>
          )}
          <div className="mx-auto max-w-[70ch]">
            {headline && (
              <h2 className="mb-4 text-xl font-bold leading-tight text-slate-900">
                {headline}
              </h2>
            )}
            {bodyParagraphs.map((paragraph, pIdx) => (
              <p key={pIdx} className={pIdx > 0 ? "mt-6" : undefined}>
                {tokenize(paragraph).map((tok) => {
                  const instanceKey = `t${tokenSeq++}`;
                  const row = matchWord(glossaryIndex, tok);
                  if (!row) return <span key={instanceKey}>{tok}</span>;
                  const wordKey = lemmaKey(row);
                  const active = collectedSet.has(wordKey);
                  const isOpen = popover?.instanceKey === instanceKey;
                  return (
                    <span
                      key={instanceKey}
                      role="button"
                      tabIndex={0}
                      aria-haspopup="dialog"
                      aria-expanded={isOpen}
                      aria-pressed={active}
                      onClick={(e) =>
                        openPopoverFor(instanceKey, row, e.currentTarget, "pointer")
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPopoverFor(instanceKey, row, e.currentTarget, "keyboard");
                        }
                      }}
                      title={active ? "Saved — tap for details" : "Tap for definition"}
                      className={`cursor-pointer touch-manipulation select-none rounded px-0.5 underline decoration-dotted underline-offset-4 transition-colors ${
                        active
                          ? "bg-brand-600 text-white decoration-transparent"
                          : "decoration-brand-400 hover:bg-brand-50"
                      }`}
                    >
                      {tok}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
          {hasGlossary && <span id="after-passage" tabIndex={-1} className="sr-only" />}
        </Card>

        {hasGlossary && (
          <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Saved ({collected.length})
            </h2>

            {collected.length === 0 ? (
              <Card className="text-sm text-slate-600">
                <div className="flex items-center gap-2 text-slate-500">
                  <Sparkles className="size-4 text-amber-400" />
                  No words saved yet.
                </div>
              </Card>
            ) : (
              <Card className="space-y-1.5 p-2">
                {collected.map((key) => {
                  const g = lemmaMap.get(key);
                  if (!g) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {g.word}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {g.translation_uz || g.definition_en}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSaved(key)}
                        aria-label={`Remove ${g.word}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </Card>
            )}

            {canPractise ? (
              <LinkButton
                href={`/practice/vocab/${id}`}
                className="w-full justify-center gap-1.5"
              >
                Practise these
                <ArrowRight className="size-4" />
              </LinkButton>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-center text-xs text-slate-500">
                Save {MIN_TO_PRACTISE - collected.length} more to start practising.
              </p>
            )}
          </aside>
        )}
      </div>

      {!hasGlossary && !glossaryFailed && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Info className="size-3.5 shrink-0" /> Add a glossary CSV when uploading
          to make words saveable and drillable.
        </p>
      )}

      {popover && popoverPos && (
        <div
          ref={attachPopoverRef}
          role="dialog"
          aria-label={`${popover.row.word} — glossary entry`}
          className="fixed z-50 flex w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          style={{
            top: popoverPos.top,
            left: popoverPos.left,
            // Caps the whole card to the viewport (minus margin) so a long
            // definition/example scrolls inside it instead of pushing the
            // card — and its Save button — off-screen. Verified at 360x640.
            maxHeight: `calc(100vh - ${POPOVER_MARGIN * 2}px)`,
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-2 p-4 pb-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">
                {popover.row.word}
              </p>
              {popover.row.part_of_speech && (
                <Badge tone="neutral" className="mt-1">
                  {popover.row.part_of_speech}
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={closePopover}
              aria-label="Close"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <p className="text-sm text-slate-700">{popover.row.definition_en}</p>
            {popover.row.translation_uz && (
              <p className="mt-1.5 text-sm text-slate-500">{popover.row.translation_uz}</p>
            )}
            {popover.row.example && (
              <p className="mt-2 text-sm italic text-slate-500">“{popover.row.example}”</p>
            )}
          </div>
          <div className="shrink-0 border-t border-slate-100 p-4 pt-3">
            <Button
              type="button"
              variant={collectedSet.has(popover.wordKey) ? "secondary" : "primary"}
              className="w-full justify-center"
              onClick={() => toggleSave(popover.row)}
            >
              {collectedSet.has(popover.wordKey) ? "Saved — tap to remove" : "Save word"}
            </Button>
          </div>
        </div>
      )}

      {flash && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {flash}
        </div>
      )}
    </div>
  );
}
