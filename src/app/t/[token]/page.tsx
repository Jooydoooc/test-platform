import Link from "next/link";
import { getTestByShareToken, getShareAttemptState } from "@/lib/data/attempts";
import { getShareTestQuestions } from "@/lib/data/tests";
import { TestTaker } from "./TestTaker";
import { Card } from "@/components/ui";

// Shared-link entry point: /t/<share_token>. Server-resolves the token (login is
// enforced by middleware), fetches questions WITHOUT answer keys, and hands off
// to the client taker. Grading and EXP happen server-side on submit.
export default async function SharedTestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const test = await getTestByShareToken(token);

  if (!test) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Link not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          This test link is invalid or has been changed. Ask your teacher for a
          new one.
        </p>
        <Link
          href="/tests"
          className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
        >
          Go to Tests
        </Link>
      </div>
    );
  }

  // Server-side completion gate (0032): a READ-ONLY check for "has this
  // student already submitted?" BEFORE fetching questions, so a student who
  // already submitted never has the question bank serialized into the RSC
  // payload. This deliberately does NOT create an attempt or anchor
  // started_at (the exam timer) — Next.js can render a dynamic route
  // speculatively (<Link prefetch>, router.prefetch(), RSC prefetch), and a
  // mutating call here would risk starting a student's exam clock on a mere
  // render, before they ever press "Begin". Attempt CREATION stays where it
  // always was: the client-side startAttempt() call in TestTaker below is
  // the single writer.
  const state = await getShareAttemptState(token);

  if (!state.ok) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-bold text-slate-900">
          Can’t open this test
        </h1>
        <p className="mt-2 text-sm text-slate-600">{state.error}</p>
      </Card>
    );
  }

  if (state.alreadyCompleted) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-bold text-slate-900">
          Already completed
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          You’ve already taken this test. Each test can be taken once.
        </p>
        {state.resultId && (
          <Link
            href={`/results?r=${state.resultId}`}
            className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            View your result
          </Link>
        )}
      </Card>
    );
  }

  const questions = await getShareTestQuestions(token);

  return (
    <TestTaker
      testId={test.id}
      token={token}
      title={test.title}
      description={test.description}
      timeLimitSec={test.timeLimitSec}
      questions={questions.map((q) => ({
        id: q.id,
        format: q.format,
        prompt: q.prompt,
        content: q.content,
      }))}
    />
  );
}
