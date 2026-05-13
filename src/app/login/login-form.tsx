"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { AUTH_SECRET_SETUP_ROUTE } from "@/lib/auth-secret-docs";

const inp =
  "w-full rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[color:color-mix(in_oklab,var(--ticketing-accent)_45%,transparent)] focus:outline-none focus:ring-1 focus:ring-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)]";

const initial: LoginState = {};

export function LoginForm({
  showAuthSecretMissing,
  showDevInsecureAuthHint,
  message,
  nextPath,
}: {
  showAuthSecretMissing: boolean;
  showDevInsecureAuthHint?: boolean;
  message?: { kind: "info" | "error"; text: string };
  nextPath?: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  const googleHref = nextPath
    ? `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`
    : "/api/auth/google/start";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {message ? (
        <p
          className={
            message.kind === "info"
              ? "rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_10%,transparent)] px-4 py-3 text-sm text-zinc-100"
              : "rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300"
          }
          role={message.kind === "info" ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : null}
      {showAuthSecretMissing ? (
        <p
          className="rounded-lg border border-[color:color-mix(in_oklab,var(--ticketing-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--ticketing-accent)_12%,transparent)] px-4 py-3 text-sm text-[color:color-mix(in_oklab,var(--ticketing-accent)_78%,white_18%)]"
          role="alert"
        >
          Set <span className="font-mono">AUTH_SECRET</span> to a random string (32+ characters), then
          redeploy (Vercel) or restart <span className="font-mono">npm run dev</span> (local).{" "}
          <Link
            href={AUTH_SECRET_SETUP_ROUTE}
            className="font-medium text-[color:color-mix(in_oklab,var(--ticketing-accent)_86%,white_14%)] underline decoration-[color:color-mix(in_oklab,var(--ticketing-accent)_55%,transparent)] underline-offset-2 hover:text-white"
          >
            Open setup steps
          </Link>
          <span className="text-[color:color-mix(in_oklab,var(--ticketing-accent)_62%,transparent)]"> — also </span>
          <span className="font-mono text-[color:color-mix(in_oklab,var(--ticketing-accent)_86%,white_14%)]">DEPLOY.md</span>
          <span className="text-[color:color-mix(in_oklab,var(--ticketing-accent)_62%,transparent)]"> in the repo.</span>
          {showDevInsecureAuthHint ? (
            <>
              {" "}
              <span className="block pt-2 text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_18%)]">
                Local-only fallback: set{" "}
                <span className="font-mono text-[color:color-mix(in_oklab,var(--ticketing-accent)_86%,white_14%)]">
                  ALLOW_INSECURE_DEV_AUTH=1
                </span>{" "}
                to use a
                dev placeholder secret (never in production).
              </span>
            </>
          ) : null}
        </p>
      ) : null}
      {state.error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
      <Link
        href={googleHref}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.08] px-4 py-2.5 text-sm font-medium text-zinc-100 ring-1 ring-white/10 transition-colors hover:bg-white/[0.12]"
      >
        Continue with Google
      </Link>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
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
        className="rounded-lg bg-[color:var(--ticketing-accent)] px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
