import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getServerUser, isAdminRole } from "@/lib/auth-server";
import {
  listTestShareLinks,
  listHostedTestShareLinks,
  setTestPublished,
  setHtmlTestPublished,
} from "@/lib/data/tests";
import type { Level } from "@/lib/database.types";
import { CopyLink } from "./CopyLink";
import { PublishToggle } from "./PublishToggle";

// Short level labels (mirrors LEVEL_OPTIONS in lib/books.ts) for hosted tests.
const LEVEL_LABEL: Record<Level, string> = {
  BEGINNER: "Beginner",
  ELEMENTARY: "Elementary",
  PRE_IELTS: "Pre-IELTS",
  IELTS_INTRODUCTION: "IELTS Introduction",
  IELTS_GRADUATION: "IELTS Graduation",
};

// Admin-only: share links for every test. Students open /t/<token> (server-graded
// DB tests) or /ht/<token> (hosted, self-grading HTML tests), sign in, and take
// the test — both earn EXP by score.
export default async function TestLinksPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/tests/links");
  if (!isAdminRole(user.role)) redirect("/tests");

  const [links, hosted] = await Promise.all([
    listTestShareLinks(),
    listHostedTestShareLinks(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Share tests
        </h1>
        <p className="text-sm text-slate-600">
          Send a link to your students. Each student can take a test once; EXP is
          earned by score.
        </p>
      </div>

      {/* Hosted HTML tests (/ht/<token>) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Interactive tests
        </h2>
        {hosted.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">No interactive tests yet.</p>
          </Card>
        ) : (
          hosted.map((t) => {
            const path = `/ht/${t.token}`;
            const tags = [
              t.skillScope === "MIXED" ? "Mixed" : t.skillScope,
              t.level ? LEVEL_LABEL[t.level] : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Card
                key={t.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {t.title}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {path}
                    {tags && ` · ${tags}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <CopyLink path={path} />
                  <PublishToggle
                    testId={t.id}
                    initialPublished={t.published}
                    kind="interactive test"
                    setPublished={setHtmlTestPublished}
                  />
                </div>
              </Card>
            );
          })
        )}
      </section>

      {/* Server-graded DB tests (/t/<token>) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Standard tests
        </h2>
        {links.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">No tests yet.</p>
          </Card>
        ) : (
          links.map((t) => {
            const path = `/t/${t.token}`;
            return (
              <Card
                key={t.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {t.title}
                  </p>
                  <a
                    href={path}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs text-slate-500 hover:text-brand-600 hover:underline"
                  >
                    {path}
                  </a>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <CopyLink path={path} />
                  <PublishToggle
                    testId={t.id}
                    initialPublished={t.published}
                    kind="test"
                    setPublished={setTestPublished}
                  />
                </div>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
