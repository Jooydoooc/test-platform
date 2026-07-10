import Link from "next/link";
import { getTestByShareToken } from "@/lib/data/attempts";
import { getTestQuestions } from "@/lib/data/tests";
import { TestTaker } from "./TestTaker";

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

  const questions = await getTestQuestions(test.id);

  return (
    <TestTaker
      testId={test.id}
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
