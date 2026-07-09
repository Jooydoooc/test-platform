"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import {
  addCollectedWord,
  getCollectedEntries,
  getReadingPassage,
  normalizeWord,
  removeCollectedWord,
} from "@/lib/vocab-store";

const MIN_TO_PRACTISE = 4;

// Reader — students read a passage and double-tap highlighted words to save
// them. Only words in the passage's target dictionary can be saved, so every
// collected word carries the data the Practice drills need.
export default function VocabReadPage({
  params,
}: {
  params: Promise<{ passageId: string }>;
}) {
  const { passageId } = use(params);
  const passage = getReadingPassage(passageId);
  if (!passage) notFound();

  // Ordered list of collected word keys (add order). Client-only to avoid an
  // SSR/hydration mismatch reading localStorage.
  const [collected, setCollected] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setCollected(getCollectedEntries(passageId).map((e) => e.wordKey));
  }, [passageId]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);

  const tokens = useMemo(
    () => passage.text.match(/[A-Za-z']+|[^A-Za-z']+/g) ?? [],
    [passage.text],
  );

  function onWord(token: string) {
    const key = normalizeWord(token);
    if (!key) return;
    if (!passage!.targets[key]) {
      setFlash(`“${token}” isn’t a saveable word here`);
      return;
    }
    setCollected((prev) => {
      if (prev.includes(key)) {
        removeCollectedWord(passageId, key);
        return prev.filter((k) => k !== key);
      }
      addCollectedWord(passageId, key);
      return [...prev, key];
    });
  }

  const collectedSet = new Set(collected);
  const canPractise = collected.length >= MIN_TO_PRACTISE;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">
          Vocabulary · Reading
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {passage.title}
        </h1>
        <p className="text-sm text-slate-600">
          Double-tap a{" "}
          <span className="underline decoration-dotted decoration-brand-400 underline-offset-4">
            highlighted
          </span>{" "}
          word to save it. Tap again to remove it.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Passage */}
        <Card className="leading-9 text-[17px] text-slate-800">
          <p>
            {tokens.map((tok, i) => {
              const key = normalizeWord(tok);
              const isTarget = Boolean(key && passage.targets[key]);
              if (!isTarget) return <span key={i}>{tok}</span>;
              const active = collectedSet.has(key);
              return (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  onDoubleClick={() => onWord(tok)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onWord(tok);
                    }
                  }}
                  title={active ? "Saved — tap to remove" : "Double-tap to save"}
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
        </Card>

        {/* Collected panel */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Saved ({collected.length})
            </h2>
          </div>

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
                const seed = passage.targets[key];
                if (!seed) return null;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {seed.word}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {seed.translation_uz}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onWord(seed.word)}
                      aria-label={`Remove ${seed.word}`}
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
              href={`/practice/vocab/${passageId}`}
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
      </div>

      {/* transient flash */}
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
