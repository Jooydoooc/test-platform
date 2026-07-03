"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, useSession } from "@/lib/auth";

export function SiteHeader() {
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Close both menus whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
    setOptionsOpen(false);
  }, [pathname]);

  // Close the options dropdown on outside click or Escape.
  useEffect(() => {
    if (!optionsOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOptionsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [optionsOpen]);

  // Primary nav. Dashboard now lives in the options menu, not the bar.
  const navItems = [
    { href: "/", label: "Home" },
    { href: "/practice", label: "Practice" },
    { href: "/tests", label: "Tests" },
    { href: "/books", label: "Books" },
    ...(user?.role === "teacher" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  function signOut() {
    setNavOpen(false);
    setOptionsOpen(false);
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

        {/* Desktop / tablet: inline nav + single options icon */}
        <div className="hidden flex-1 items-center justify-end gap-3 sm:flex">
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
            <div className="relative" ref={optionsRef}>
              <button
                type="button"
                onClick={() => setOptionsOpen((v) => !v)}
                aria-label="Options"
                aria-haspopup="menu"
                aria-expanded={optionsOpen}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <GearIcon />
              </button>

              {optionsOpen && (
                <div
                  role="menu"
                  aria-label="Options"
                  className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {user.name}
                    </p>
                    <p className="text-xs capitalize text-slate-500">
                      {user.role}
                    </p>
                  </div>
                  <Link
                    href="/dashboard"
                    role="menuitem"
                    onClick={() => setOptionsOpen(false)}
                    className="block px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Dashboard
                  </Link>
                  <button
                    role="menuitem"
                    onClick={signOut}
                    className="block w-full border-t border-slate-100 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Log out
                  </button>
                </div>
              )}
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

        {/* Mobile: hamburger toggle (or inline Sign in when logged out) */}
        <div className="sm:hidden">
          {user ? (
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              aria-controls="mobile-menu"
              className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
            >
              {navOpen ? <CloseIcon /> : <MenuIcon />}
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
      {user && navOpen && (
        <nav
          id="mobile-menu"
          className="border-t border-slate-200 px-4 py-3 sm:hidden"
        >
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setNavOpen(false)}
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

          <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="px-3 pb-2">
              <p className="truncate text-sm font-medium text-slate-800">
                {user.name}
              </p>
              <p className="text-xs capitalize text-slate-500">{user.role}</p>
            </div>
            <Link
              href="/dashboard"
              onClick={() => setNavOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Dashboard
            </Link>
            <button
              onClick={signOut}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
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
