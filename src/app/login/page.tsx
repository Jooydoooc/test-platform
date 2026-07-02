"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { authenticate, DEMO_CREDENTIALS, login } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const user = authenticate(username, password);
    if (!user) {
      setError("Invalid username or password.");
      return;
    }
    login(user);
    router.replace(next);
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-sm text-slate-600">
          Log in to author or take tests.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              autoFocus
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              autoComplete="current-password"
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </Card>

      <Card className="bg-slate-50">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Demo accounts
        </p>
        <ul className="space-y-1 text-sm text-slate-600">
          {DEMO_CREDENTIALS.map((c) => (
            <li key={c.username} className="flex justify-between gap-3">
              <span className="capitalize text-slate-700">{c.role}</span>
              <button
                type="button"
                className="font-mono text-slate-500 hover:text-slate-900"
                onClick={() => {
                  setUsername(c.username);
                  setPassword(c.password);
                  setError("");
                }}
              >
                {c.username} / {c.password}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Click a credential to fill the form.
        </p>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
