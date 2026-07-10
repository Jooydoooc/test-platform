import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getServerUser, isAdminRole } from "@/lib/auth-server";
import { listTestShareLinks } from "@/lib/data/tests";
import { CopyLink } from "./CopyLink";

// Admin-only: share links for every test. Students open /t/<token>, sign in,
// and get one graded attempt that earns EXP by score.
export default async function TestLinksPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/tests/links");
  if (!isAdminRole(user.role)) redirect("/tests");

  const links = await listTestShareLinks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Share tests
        </h1>
        <p className="text-sm text-slate-600">
          Send a link to your students. Each student can take a test once; EXP is
          earned by score.
        </p>
      </div>

      {links.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No tests yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((t) => {
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
                  <p className="truncate text-xs text-slate-500">{path}</p>
                </div>
                <CopyLink path={path} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
