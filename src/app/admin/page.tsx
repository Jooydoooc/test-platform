"use client";

import { BookOpen, Users } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { PencilIcon, SendIcon } from "@/components/icons";
import { useTests } from "@/lib/store";

export default function AdminPage() {
  const tests = useTests();
  const questionCount = tests.reduce((s, t) => s + t.questions.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin</h1>
        <p className="text-sm text-slate-600">
          Admin tools for managing content and integrations.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Tests" value={tests.length} />
        <Stat label="Questions" value={questionCount} />
        <Stat
          label="Empty tests"
          value={tests.filter((t) => t.questions.length === 0).length}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
            <Users className="size-5" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">Students</h2>
          <p className="flex-1 text-sm text-slate-600">
            Full control over every account: search the roster, change roles and
            groups, review each student&apos;s performance, or remove accounts.
          </p>
          <div>
            <LinkButton href="/admin/students">Manage students</LinkButton>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
            <PencilIcon />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">Tests</h2>
          <p className="flex-1 text-sm text-slate-600">
            Create and edit tests, build question banks, and upload self-contained
            HTML tests for students.
          </p>
          <div className="flex gap-2">
            <LinkButton href="/author">Manage tests</LinkButton>
            <LinkButton href="/author/tests/html" variant="secondary">
              Upload HTML test
            </LinkButton>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
            <BookOpen className="size-5" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">Books &amp; units</h2>
          <p className="flex-1 text-sm text-slate-600">
            Upload units by category (Vocabulary, Grammar, Reading, Articles) and
            delete any you no longer need. Students get a read-only catalog.
          </p>
          <div className="flex gap-2">
            <LinkButton href="/admin/books">Manage units</LinkButton>
            <LinkButton href="/author/upload" variant="secondary">
              Upload a unit
            </LinkButton>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/15">
            <SendIcon />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">Telegram</h2>
          <p className="flex-1 text-sm text-slate-600">
            Connect a bot for submission alerts, announcements, and student
            result messages.
          </p>
          <LinkButton href="/telegram" variant="secondary">
            Telegram settings
          </LinkButton>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
