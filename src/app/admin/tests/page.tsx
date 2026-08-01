"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileCode2, Link2, Plus } from "lucide-react";
import { Button, Card, LinkButton } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { deleteTest, maxScore, saveTest, uid, useTests } from "@/lib/store";
import type { Test } from "@/lib/types";

export default function AdminTestsPage() {
  const { user, loading } = useSession();
  const isAdmin = user?.role === "admin";
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

  if (!loading && !isAdmin) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Managing tests is available to admins only.
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tests</h1>
          <p className="text-sm text-slate-600">
            Build question-based tests, upload self-contained HTML mocks, and
            share graded links with students.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <LinkButton href="/tests/links" variant="secondary">
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="size-4" /> Share links
            </span>
          </LinkButton>
          <LinkButton href="/author/tests/html" variant="secondary">
            <span className="inline-flex items-center gap-1.5">
              <FileCode2 className="size-4" /> Upload HTML test
            </span>
          </LinkButton>
          <Button onClick={createTest}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-4" /> New test
            </span>
          </Button>
        </div>
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
            <Card key={t.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{t.title}</h3>
                <p className="text-sm text-slate-500">
                  {t.questions.length} question
                  {t.questions.length === 1 ? "" : "s"} · {maxScore(t)} point
                  {maxScore(t) === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <LinkButton href={`/author/${t.id}`} variant="secondary">
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
