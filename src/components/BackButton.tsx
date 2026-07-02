"use client";

import { usePathname, useRouter } from "next/navigation";

// A global "back" control shown on every page except the home page and login,
// where there is nowhere meaningful to go back to. Uses browser history when
// available and falls back to the home page for direct/deep links.
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/" || pathname === "/login") return null;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="mb-6 inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:min-h-0"
    >
      <span aria-hidden="true">←</span> Back
    </button>
  );
}
