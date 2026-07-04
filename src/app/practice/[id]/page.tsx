"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionRunner } from "@/components/QuestionRunner";
import { bookOf, getTest } from "@/lib/store";
import type { Test } from "@/lib/types";

export default function PracticeRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<Test | null>(null);

  useEffect(() => {
    const t = getTest(id);
    if (!t || t.questions.length === 0) {
      router.replace("/practice");
      return;
    }
    setTest(t);
  }, [id, router]);

  if (!test) return <p className="text-slate-500">Loading…</p>;

  return (
    <QuestionRunner test={test} mode="practice" subtitle={bookOf(test)} />
  );
}
