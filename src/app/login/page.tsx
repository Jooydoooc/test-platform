"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { authenticate, DEMO_CREDENTIALS, login, SUPABASE_ENABLED } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

function Header() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm">
        L
      </span>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Sign in to Lexora
        </h1>
        <p className="text-sm text-slate-600">
          Your private English practice and progress space.
        </p>
      </div>
    </div>
  );
}

// Real auth (Supabase): email/password + Google OAuth.
function SupabaseLogin({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError("Invalid email or password.");
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError("Could not start Google sign-in.");
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            autoFocus
            autoComplete="email"
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
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={signInWithGoogle}
        disabled={busy}
      >
        Continue with Google
      </Button>
    </Card>
  );
}

// Fallback (localStorage prototype): username/password with demo accounts.
function LegacyLogin({ next }: { next: string }) {
  const router = useRouter();
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
    <>
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
    </>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  return (
    <div className="mx-auto max-w-sm space-y-6 pt-4 sm:pt-10">
      <Header />
      {SUPABASE_ENABLED ? (
        <SupabaseLogin next={next} />
      ) : (
        <LegacyLogin next={next} />
      )}
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
