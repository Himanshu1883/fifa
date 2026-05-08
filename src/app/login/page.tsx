import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, tryAuthSecretKeyBytes } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  const showAuthSecretMissing = tryAuthSecretKeyBytes() === null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-4 py-16 sm:px-6">
        <header className="space-y-2 text-center">
          <p className="text-sm font-medium tracking-wide text-emerald-400/90">Event catalogue</p>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-zinc-400">Use your account to view matches and catalogues.</p>
        </header>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-md">
          <LoginForm showAuthSecretMissing={showAuthSecretMissing} />
        </div>
        <p className="text-center text-xs text-zinc-500">
          After signing in you are redirected to the matches home page.
        </p>
      </div>
    </div>
  );
}
