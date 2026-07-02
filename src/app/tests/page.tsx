"use client";

import { Card, LinkButton } from "@/components/ui";
import { maxScore, useTests } from "@/lib/store";

export default function TestsPage() {
  const tests = useTests().filter((t) => t.questions.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Take a test</h1>
        <p className="text-sm text-slate-600">
          Choose a test below to begin.
        </p>
      </div>

      {tests.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No tests are available yet. Create one in the{" "}
            <a className="underline" href="/author">
              authoring
            </a>{" "}
            section first.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tests.map((t) => (
            <Card key={t.id} className="flex flex-col gap-3">
              <div>
                <h3 className="font-semibold">{t.title}</h3>
                {t.description && (
                  <p className="mt-1 text-sm text-slate-600">{t.description}</p>
                )}
              </div>
              <p className="text-sm text-slate-500">
                {t.questions.length} question
                {t.questions.length === 1 ? "" : "s"} · {maxScore(t)} point
                {maxScore(t) === 1 ? "" : "s"}
              </p>
              <LinkButton href={`/tests/${t.id}`}>Start →</LinkButton>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
