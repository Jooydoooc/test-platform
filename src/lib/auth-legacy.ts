"use client";

// Original localStorage prototype auth, kept as the fallback used when Supabase
// is not configured (SUPABASE_ENABLED === false). Known-good behavior so a deploy
// without Supabase env keeps working exactly as before.

import { useCallback, useEffect, useState } from "react";
import type { Role, User } from "@/lib/auth-types";

interface Account {
  username: string;
  password: string;
  name: string;
  role: Role;
}

const SESSION_KEY = "tp.session";

const ACCOUNTS: Account[] = [
  { username: "teacher", password: "teach123", name: "Tara Teacher", role: "teacher" },
  { username: "student", password: "study123", name: "Sam Student", role: "student" },
];

export function authenticate(username: string, password: string): User | null {
  const acct = ACCOUNTS.find(
    (a) =>
      a.username.toLowerCase() === username.trim().toLowerCase() &&
      a.password === password,
  );
  if (!acct) return null;
  return { name: acct.name, role: acct.role, username: acct.username };
}

function getSession(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function login(user: User): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("tp.auth"));
}

export async function legacyLogout(): Promise<void> {
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("tp.auth"));
}

export function useLegacySession(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setUser(getSession());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("tp.auth", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("tp.auth", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { user, loading };
}

export const DEMO_CREDENTIALS = ACCOUNTS.map(({ username, password, role }) => ({
  username,
  password,
  role,
}));
