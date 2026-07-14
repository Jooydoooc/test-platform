"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  Share2Icon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TrophyIcon,
  ZapIcon,
} from "lucide-react";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { logout, useSession } from "@/lib/auth";
import { useStudentXp } from "@/lib/xp";

export function SiteHeader() {
  const { user } = useSession();
  const { xp, level } = useStudentXp();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/tests", label: "Tests" },
    { href: "/practice", label: "Practice" },
    { href: "/books", label: "Books" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/dashboard", label: "Dashboard" },
  ];

  // Admins get the elevated surface (Admin lives in the account menu, not the nav).
  const isAdmin = user?.role === "admin";
  const isStudent = user?.role === "student";
  const initial = user?.name.trim().charAt(0).toUpperCase() || "?";

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

          {isStudent && <XpPill xp={xp} levelName={level.name} progress={level.progress} />}

          {user ? (
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Account menu for ${user.name}`}
                    className="group flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 text-sm text-slate-600 outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 data-[popup-open]:bg-slate-100 data-[popup-open]:text-slate-900"
                  >
                    <span
                      aria-hidden
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
                    >
                      {initial}
                    </span>
                    <ChevronDownIcon className="size-4 opacity-60 transition-transform group-data-[popup-open]:rotate-180" />
                  </button>
                }
              />
              <MenuPopup align="end" sideOffset={8} className="min-w-[13rem]">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    @{user.username}
                  </p>
                </div>
                <MenuSeparator />
                <MenuItem render={<Link href="/dashboard" />}>
                  <LayoutDashboardIcon />
                  Dashboard
                </MenuItem>
                <MenuItem render={<Link href="/leaderboard" />}>
                  <TrophyIcon />
                  Leaderboard
                </MenuItem>
                {user.role === "admin" && (
                  <>
                    <MenuItem render={<Link href="/tests/links" />}>
                      <Share2Icon />
                      Share tests
                    </MenuItem>
                    <MenuItem render={<Link href="/admin" />}>
                      <SlidersHorizontalIcon />
                      Admin
                    </MenuItem>
                  </>
                )}
                <MenuSeparator />
                <MenuItem variant="destructive" onClick={signOut}>
                  <LogOutIcon />
                  Log out
                </MenuItem>
              </MenuPopup>
            </Menu>
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

        {/* Mobile / tablet: XP pill + hamburger (or inline Sign in when logged out) */}
        <div className="flex items-center gap-2 lg:hidden">
          {user && isStudent && (
            <XpPill xp={xp} levelName={level.name} progress={level.progress} compact />
          )}
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
          {/* Account identity — mirrors the desktop dropdown header */}
          <div className="mb-3 flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white"
            >
              {user.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {user.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                @{user.username}
              </p>
            </div>
            {isAdmin && (
              <ShieldCheckIcon
                className="ms-auto size-5 shrink-0 text-brand-600"
                aria-label="Admin"
              />
            )}
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
            {isAdmin && (
              <li>
                <Link
                  href="/tests/links"
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isActive("/tests/links")
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Share2Icon className="size-4" />
                  Share tests
                </Link>
              </li>
            )}
          </ul>

          <div className="my-2 h-px bg-slate-200" />

          {/* Destructive Log out — mirrors the dropdown's destructive item */}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOutIcon className="size-4" />
            Log out
          </button>
        </nav>
      )}
    </header>
  );
}

// Persistent XP indicator — students see their progress on every page. Links to
// the dashboard so tapping it jumps to the full breakdown. `compact` drops the
// "XP" label for the tighter mobile bar.
function XpPill({
  xp,
  levelName,
  progress,
  compact = false,
}: {
  xp: number;
  levelName: string;
  progress: number;
  compact?: boolean;
}) {
  return (
    <Link
      href="/dashboard"
      aria-label={`${xp.toLocaleString()} XP, ${levelName}, ${progress}% to next level`}
      title={`${levelName} · ${progress}% to next level`}
      className="group inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-1 pr-2.5 text-sm font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm">
        <ZapIcon className="size-3.5" />
      </span>
      <span className="tabular-nums">{xp.toLocaleString()}</span>
      {!compact && <span className="text-xs font-medium text-brand-500">XP</span>}
    </Link>
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
