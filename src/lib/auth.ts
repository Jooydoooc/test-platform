"use client";

import { useCallback, useEffect, useState } from "react";

export type Role = "teacher" | "student";

export interface User {
  username: string;
  name: string;
  role: Role;
}

interface Account extends User {
  password: string;
}

const SESSION_KEY = "tp.session";

// Demo accounts. In a real app these would live behind a server + hashing.
const ACCOUNTS: Account[] = [
  { username: "teacher", password: "teach123", name: "Tara Teacher", role: "teacher" },
  { username: "student", password: "study123", name: "Sam Student", role: "student" },
];

export function authenticate(
  username: string,
  password: string,
): User | null {
  const acct = ACCOUNTS.find(
    (a) =>
      a.username.toLowerCase() === username.trim().toLowerCase() &&
      a.password === password,
  );
  if (!acct) return null;
  const { password: _pw, ...user } = acct;
  void _pw;
  return user;
}

export function getSession(): User | null {
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

export function logout(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("tp.auth"));
}

/** Reactive session hook. `loading` is true until the first client read. */
export function useSession(): { user: User | null; loading: boolean } {
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
