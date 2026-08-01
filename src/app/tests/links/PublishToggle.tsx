"use client";

import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";

// Publish/unpublish toggle for a single test row. Optimistic-but-honest: the
// badge flips immediately on click, but if the RPC (admin-only, migration
// 0031) refuses or fails, the UI reverts to the last confirmed state and
// shows why — it must never claim a state the server didn't actually accept.
export function PublishToggle({
  testId,
  initialPublished,
  kind,
  setPublished,
}: {
  testId: string;
  initialPublished: boolean;
  /** Used only to build a specific accessible name ("test" vs "interactive test"). */
  kind: "test" | "interactive test";
  setPublished: (
    testId: string,
    published: boolean,
  ) => Promise<{ ok: boolean; published?: boolean; error?: string }>;
}) {
  const [published, setPublishedState] = useState(initialPublished);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !published;
    setError(null);
    setPublishedState(next); // optimistic
    startTransition(async () => {
      const result = await setPublished(testId, next);
      if (!result.ok) {
        setPublishedState(!next); // revert
        setError(result.error ?? "Could not update publish status.");
        return;
      }
      // Trust the server's own return value over our optimistic guess.
      setPublishedState(result.published ?? next);
    });
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Badge
          tone={published ? "success" : "amber"}
          aria-live="polite"
        >
          {published ? "Published" : "Unpublished"}
        </Badge>
        <Button
          type="button"
          variant="secondary"
          onClick={toggle}
          disabled={pending}
          className="px-3 py-1.5 text-xs"
          aria-label={
            published
              ? `Unpublish this ${kind} — students will no longer be able to open it`
              : `Publish this ${kind} — makes it openable by students`
          }
        >
          {pending ? "Saving…" : published ? "Unpublish" : "Publish"}
        </Button>
      </div>
      <p className="text-right text-[11px] text-slate-500" aria-live="polite">
        {error
          ? error
          : !published
            ? "Not openable by students, even with the link."
            : null}
      </p>
    </div>
  );
}
