"use client";

import { useRouter } from "next/navigation";
import { Button, Card, LinkButton } from "@/components/ui";
import { deleteTest, maxScore, saveTest, uid, useTests } from "@/lib/store";
import type { Test } from "@/lib/types";

export default function AuthorPage() {
  const tests = useTests();
  const router = useRouter();

  function createTest() {
    const id = uid();
    const now = Date.now();
    const test: Test = {
      id,
      title: "Untitled test",
      description: "",
      questions: [],
      createdAt: now,
      updatedAt: now,
    };
    saveTest(test);
    router.push(`/author/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Authoring</h1>
          <p className="text-sm text-slate-600">
            Manage your tests and question banks.
          </p>
        </div>
        <Button onClick={createTest}>+ New test</Button>
      </div>

      {tests.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No tests yet. Create your first one.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tests.map((t) => (
            <Card
              key={t.id}
              className="flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{t.title}</h3>
                <p className="text-sm text-slate-500">
                  {t.questions.length} question
                  {t.questions.length === 1 ? "" : "s"} · {maxScore(t)} point
                  {maxScore(t) === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <LinkButton
                  href={`/author/${t.id}`}
                  variant="secondary"
                >
                  Edit
                </LinkButton>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm(`Delete "${t.title}"?`)) deleteTest(t.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
