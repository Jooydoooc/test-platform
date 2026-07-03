"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, useSession } from "@/lib/auth";

export function SiteHeader() {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/practice", label: "Practice" },
    { href: "/tests", label: "Tests" },
    { href: "/books", label: "Books" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/profile", label: "Profile" },
    ...(user?.role === "teacher" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  function signOut() {
    setOpen(false);
    logout();
    router.replace("/login");
  }

  function isActive(href: string) {
    // "/" should only match the home page exactly, not every route.
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-slate-900 sm:text-lg"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-sm">
            L
          </span>
          Lexora
        </Link>

        {/* Desktop: inline nav + user menu */}
        <div className="hidden flex-1 items-center justify-end gap-3 lg:flex">
          {user && (
            <nav className="flex gap-1 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    isActive(item.href)
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {user ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">
                {user.name}
                <span className="ml-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium capitalize text-brand-700 ring-1 ring-inset ring-brand-600/15">
                  {user.role}
                </span>
              </span>
              <button
                onClick={signOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          ) : (
            pathname !== "/login" && (
              <Link
                href="/login"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                Sign in
              </Link>
            )
          )}
        </div>

        {/* Mobile / tablet: hamburger toggle (or inline Sign in when logged out) */}
        <div className="lg:hidden">
          {user ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
            >
              {open ? <CloseIcon /> : <MenuIcon />}
            </button>
          ) : (
            pathname !== "/login" && (
              <Link
                href="/login"
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                Sign in
              </Link>
            )
          )}
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {user && open && (
        <nav
          id="mobile-menu"
          className="border-t border-slate-200 px-4 py-3 lg:hidden"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-700">{user.name}</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium capitalize text-brand-700 ring-1 ring-inset ring-brand-600/15">
              {user.role}
            </span>
          </div>

          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isActive(item.href)
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <button
            onClick={signOut}
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </nav>
      )}
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
