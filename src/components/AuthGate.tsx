"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];
const TEACHER_PATHS = ["/author", "/telegram"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  const needsTeacher = TEACHER_PATHS.some((p) => pathname.startsWith(p));
  const denied =
    !loading &&
    !isPublic &&
    (!user || (needsTeacher && user.role !== "teacher"));

  useEffect(() => {
    if (loading || isPublic || !denied) return;
    if (!user) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    } else {
      // Logged in but lacks permission for this route.
      router.replace("/tests");
    }
  }, [loading, isPublic, denied, user, pathname, router]);

  if (loading) {
    return <p className="px-4 py-8 text-center text-slate-400">Loading…</p>;
  }

  if (denied) {
    return (
      <p className="px-4 py-8 text-center text-slate-400">Redirecting…</p>
    );
  }

  return <>{children}</>;
}
