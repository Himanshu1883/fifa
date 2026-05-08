"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { AUTH_SECRET_SETUP_ROUTE } from "@/lib/auth-secret-docs";

const inp =
  "w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/40";

const initial: LoginState = {};

export function LoginForm({ showAuthSecretMissing }: { showAuthSecretMissing: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {showAuthSecretMissing ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200" role="alert">
          Set <span className="font-mono">AUTH_SECRET</span> to a random string (32+ characters), then
          redeploy (Vercel) or restart <span className="font-mono">npm run dev</span> (local).{" "}
          <Link
            href={AUTH_SECRET_SETUP_ROUTE}
            className="font-medium text-amber-100 underline decoration-amber-500/50 underline-offset-2 hover:text-white"
          >
            Open setup steps
          </Link>
          <span className="text-amber-200/80"> — also </span>
          <span className="font-mono text-amber-100/90">DEPLOY.md</span>
          <span className="text-amber-200/80"> in the repo.</span>
        </p>
      ) : null}
      {state.error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          maxLength={64}
          className={inp}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          className={inp}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
