"use client";

import { useMemo, useState } from "react";
import { Card, LinkButton } from "@/components/ui";
import { groupOf, maxScore, useTests } from "@/lib/store";
import { LEVEL_TESTS, TEST_GROUPS, type TestGroup } from "@/lib/types";

export default function TestsPage() {
  const tests = useTests().filter((t) => t.questions.length > 0);

  const [group, setGroup] = useState<TestGroup>("Level Tests");
  // The selected level test (title), when the "Level Tests" group is open.
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(true);

  // Tests in the selected group.
  const inGroup = useMemo(
    () => tests.filter((t) => groupOf(t) === group),
    [tests, group],
  );

  // When a specific level test is picked, narrow to that one by title.
  const shown = useMemo(() => {
    if (group === "Level Tests" && activeLevel) {
      return inGroup.filter(
        (t) => t.title.toLowerCase() === activeLevel.toLowerCase(),
      );
    }
    return inGroup;
  }, [group, activeLevel, inGroup]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Take a test</h1>
        <p className="text-sm text-slate-600">Choose a test below to begin.</p>
      </div>

      <div className="flex gap-4">
        {/* Sandwich (hamburger) toggle for the tests menu */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="tests-menu"
          aria-label={menuOpen ? "Hide tests menu" : "Show tests menu"}
          className="h-9 w-9 shrink-0 rounded-md border border-slate-200 text-slate-700 transition hover:bg-slate-50"
        >
          <span className="mx-auto flex h-4 w-5 flex-col justify-between">
            <span className="h-0.5 w-full rounded bg-current" />
            <span className="h-0.5 w-full rounded bg-current" />
            <span className="h-0.5 w-full rounded bg-current" />
          </span>
        </button>

        {/* Left-side vertical tests menu */}
        {menuOpen && (
          <nav
            id="tests-menu"
            aria-label="Test groups"
            className="w-56 shrink-0 space-y-1 border-r border-slate-200 pr-2"
          >
            {TEST_GROUPS.map((g) => {
              const count = tests.filter((t) => groupOf(t) === g).length;
              const isActive = g === group;
              const isLevel = g === "Level Tests";
              return (
                <div key={g}>
                  <button
                    type="button"
                    onClick={() => {
                      setGroup(g);
                      setActiveLevel(null);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="truncate">{g}</span>
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

                  {/* Nested level tests under the "Level Tests" group */}
                  {isLevel && isActive && (
                    <div className="mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                      {LEVEL_TESTS.map((name) => {
                        const isSel =
                          activeLevel?.toLowerCase() === name.toLowerCase();
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() =>
                              setActiveLevel(isSel ? null : name)
                            }
                            aria-current={isSel ? "true" : undefined}
                            className={`block w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition ${
                              isSel
                                ? "bg-slate-100 font-medium text-slate-900"
                                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

        {/* Tests for the active group / level */}
        <div className="min-w-0 flex-1">
          {shown.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-600">
                No tests in{" "}
                <span className="font-medium">{activeLevel ?? group}</span> yet.
                Create one in the{" "}
                <a className="underline" href="/author">
                  authoring
                </a>{" "}
                section.
              </p>
            </Card>
          ) : (
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
                    {t.questions.length === 1 ? "" : "s"} · {maxScore(t)} point
                    {maxScore(t) === 1 ? "" : "s"}
                    {t.durationMinutes
                      ? ` · ⏱ ${t.durationMinutes} min`
                      : ""}
                  </p>
                  <LinkButton href={`/tests/${t.id}`}>Start →</LinkButton>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
