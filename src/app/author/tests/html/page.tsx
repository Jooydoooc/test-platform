"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { Button, Card, Field, LinkButton, inputClass } from "@/components/ui";
import { useSession, SUPABASE_ENABLED } from "@/lib/auth";
import { LEVEL_OPTIONS } from "@/lib/books";
import type { Level, TestSkillScope } from "@/lib/database.types";

type SubmitState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "done"; token: string; title: string }
  | { phase: "error"; message: string };

const SKILL_SCOPES: { value: TestSkillScope; label: string }[] = [
  { value: "READING", label: "Reading" },
  { value: "LISTENING", label: "Listening" },
  { value: "GRAMMAR", label: "Grammar" },
  { value: "VOCABULARY", label: "Vocabulary" },
  { value: "MIXED", label: "Mixed / Full mock" },
];

export default function UploadHtmlTestPage() {
  const { user } = useSession();
  const [title, setTitle] = useState("");
  const [skillScope, setSkillScope] = useState<TestSkillScope>("READING");
  const [level, setLevel] = useState<Level | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({ phase: "idle" });
  const topRef = useRef<HTMLDivElement>(null);

  const canSubmit =
    SUPABASE_ENABLED && title.trim() && file != null && submit.phase !== "saving";

  async function handleSave() {
    if (!file) return;
    setSubmit({ phase: "saving" });
    const form = new FormData();
    form.append("title", title.trim());
    form.append("skillScope", skillScope);
    form.append("level", level);
    form.append("file", file);

    try {
      const res = await fetch("/api/tests/html", { method: "POST", body: form });
      const data = (await res.json()) as {
        ok: boolean;
        token?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setSubmit({ phase: "error", message: data.error ?? "Upload failed." });
      } else {
        setSubmit({ phase: "done", token: data.token ?? "", title: title.trim() });
      }
    } catch {
      setSubmit({ phase: "error", message: "Network error — please try again." });
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (user?.role !== "admin") {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          Uploading HTML tests is available to admins only.
        </p>
      </Card>
    );
  }

  const shareUrl =
    submit.phase === "done" && typeof window !== "undefined"
      ? `${window.location.origin}/ht/${submit.token}`
      : "";

  return (
    <div ref={topRef} className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Upload an HTML test
          </h1>
          <p className="text-sm text-slate-600">
            Drop a self-contained <code>.html</code> test (e.g. an IELTS mock).
            It&apos;s hosted as-is and served to students at a private link.
          </p>
        </div>
        <LinkButton href="/author" variant="secondary">
          Back
        </LinkButton>
      </div>

      {!SUPABASE_ENABLED && (
        <Banner tone="warn">
          The Supabase backend isn&apos;t configured, so uploading is disabled.
        </Banner>
      )}

      {submit.phase === "done" && (
        <Banner tone="ok">
          <p className="font-semibold">“{submit.title}” uploaded.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-white/70 px-2 py-1 text-xs text-emerald-900">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              <Copy className="size-3.5" /> Copy link
            </button>
            <Link href={`/ht/${submit.token}`} className="text-xs font-semibold underline">
              Open test
            </Link>
            <button
              type="button"
              onClick={() => {
                setTitle("");
                setFile(null);
                setLevel("");
                setSubmit({ phase: "idle" });
              }}
              className="text-xs font-semibold underline"
            >
              Upload another
            </button>
          </div>
        </Banner>
      )}
      {submit.phase === "error" && <Banner tone="warn">{submit.message}</Banner>}

      <Card className="space-y-4">
        <Field label="Title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. IELTS Reading — Full Mock 3"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Skill">
            <select
              className={inputClass}
              value={skillScope}
              onChange={(e) => setSkillScope(e.target.value as TestSkillScope)}
            >
              {SKILL_SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Level (optional)">
            <select
              className={inputClass}
              value={level}
              onChange={(e) => setLevel(e.target.value as Level | "")}
            >
              <option value="">No level</option>
              {LEVEL_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-slate-900">HTML file</h2>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm transition hover:border-brand-300 hover:bg-white">
          <FileText className="size-5 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate text-slate-600">
            {file ? file.name : "Choose a .html file (max 50MB)"}
          </span>
          <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-brand-600 ring-1 ring-inset ring-brand-200">
            Choose file
          </span>
          <input
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setSubmit({ phase: "idle" });
            }}
          />
        </label>
        {file && (
          <p className="text-xs text-slate-500">
            {(file.size / 1_048_576).toFixed(2)} MB
          </p>
        )}
      </Card>

      <div className="flex items-center justify-end">
        <Button onClick={handleSave} disabled={!canSubmit}>
          {submit.phase === "saving" ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-4 animate-spin" /> Uploading…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Upload className="size-4" /> Upload test
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {tone === "ok" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
