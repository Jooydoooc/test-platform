"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionRunner } from "@/components/QuestionRunner";
import { getBookAsTest } from "@/lib/books-client";
import type { Test } from "@/lib/types";

// Practise an uploaded Grammar/Vocabulary book — its questions rendered through
// the shared QuestionRunner (same engine as localStorage tests).
export default function BookPracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<Test | null>(null);

  useEffect(() => {
    let active = true;
    getBookAsTest(id)
      .then((t) => {
        if (!active) return;
        if (!t || t.questions.length === 0) router.replace("/books");
        else setTest(t);
      })
      .catch(() => router.replace("/books"));
    return () => {
      active = false;
    };
  }, [id, router]);

  if (!test) return <p className="text-slate-500">Loading…</p>;

  return <QuestionRunner test={test} mode="practice" subtitle="Uploaded book" />;
}
