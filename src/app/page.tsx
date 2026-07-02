"use client";

import { Card, LinkButton } from "@/components/ui";
import { useSession } from "@/lib/auth";

export default function Home() {
  const { user } = useSession();
  const isTeacher = user?.role === "teacher";

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">
          {user ? `Welcome, ${user.name.split(" ")[0]}` : "A small test platform"}
        </h1>
        <p className="max-w-2xl text-slate-600">
          Create tests with multiple question types, then take them and get
          scored instantly. Everything is saved locally in your browser.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isTeacher && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">👩‍🏫 Authoring</h2>
            <p className="flex-1 text-sm text-slate-600">
              Build a question bank: single &amp; multiple choice, true/false,
              and short-answer questions with points.
            </p>
            <LinkButton href="/author">Go to authoring</LinkButton>
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">🧑‍🎓 Taking</h2>
          <p className="flex-1 text-sm text-slate-600">
            Pick a test, answer the questions, and see a graded breakdown of
            your results right away.
          </p>
          <LinkButton
            href="/tests"
            variant={isTeacher ? "secondary" : "primary"}
          >
            Browse tests
          </LinkButton>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">🧠 Practice</h2>
          <p className="flex-1 text-sm text-slate-600">
            Work through any test one question at a time with instant feedback.
            Not graded and not saved — practise as many times as you like.
          </p>
          <LinkButton href="/practice" variant="secondary">
            Start practising
          </LinkButton>
        </Card>
      </div>
    </div>
  );
}
