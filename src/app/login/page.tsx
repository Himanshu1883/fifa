import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, tryAuthSecretKeyBytes } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

type Props = {
  searchParams?: Promise<{ msg?: string | string[]; next?: string | string[] }>;
};

function firstQs(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function safeNextPath(raw: string | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (!v.startsWith("/")) return undefined;
  if (v.startsWith("//")) return undefined;
  if (v.includes("://")) return undefined;
  if (v.includes("\n") || v.includes("\r")) return undefined;
  return v;
}

function describeLoginMessage(raw: string | undefined): { kind: "info" | "error"; text: string } | null {
  const v = (raw ?? "").trim();
  if (!v) return null;

  if (v === "signin_required") {
    return { kind: "info", text: "Sign in to continue." };
  }
  if (v === "gmail_signin_required") {
    return { kind: "info", text: "Sign in to continue to Gmail." };
  }
  if (v === "buying_criteria_signin_required") {
    return { kind: "info", text: "Sign in to view buying criteria." };
  }
  if (v === "pending_approval") {
    return { kind: "info", text: "Your account is pending admin approval." };
  }
  if (v === "missing_auth_secret") {
    return { kind: "error", text: "AUTH_SECRET is missing or too short. Set it, redeploy/restart, then try again." };
  }
  if (v.startsWith("oauth_error:")) {
    return { kind: "error", text: `Google sign-in failed (${v.slice("oauth_error:".length)}). Try again.` };
  }
  if (v.startsWith("token_exchange_failed:")) {
    return { kind: "error", text: "Google sign-in failed during token exchange. Try again." };
  }
  if (v.startsWith("userinfo_failed:")) {
    return { kind: "error", text: "Google sign-in failed while fetching user profile. Try again." };
  }
  if (v === "invalid_oauth_state" || v === "missing_oauth_state") {
    return { kind: "error", text: "Google sign-in state was invalid or expired. Try again." };
  }
  if (v === "google_email_not_verified") {
    return { kind: "error", text: "Google account email is not verified. Use a verified Google account." };
  }
  if (v === "google_sub_mismatch_for_user") {
    return { kind: "error", text: "This email is already linked to a different Google account." };
  }

  return { kind: "error", text: v.slice(0, 180) };
}

export default async function LoginPage({ searchParams }: Props) {
  let session: Awaited<ReturnType<typeof getSession>> = null;
  let sessionError = false;
  try {
    session = await getSession();
  } catch {
    sessionError = true;
  }

  if (session && tryAuthSecretKeyBytes()) {
    redirect(session.approved ? "/" : "/pending-approval");
  }

  const showAuthSecretMissing = tryAuthSecretKeyBytes() === null;

  const sp = searchParams ? await searchParams : {};
  const message = describeLoginMessage(firstQs(sp.msg));
  const nextPath = safeNextPath(firstQs(sp.next));

  return (
    <div className="min-h-screen bg-gradient-to-br from-[color:var(--ticketing-surface)] via-[color:color-mix(in_oklab,var(--ticketing-surface)_70%,var(--ticketing-surface-elevated)_30%)] to-[color:var(--ticketing-surface-elevated)] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-4 py-16 sm:px-6">
        <header className="space-y-2 text-center">
          <p className="text-sm font-medium tracking-wide text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)]">
            Event catalogue
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-zinc-400">Use your account to view matches and catalogues.</p>
        </header>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-md">
          {sessionError ? (
            <p className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300" role="alert">
              Could not read the session cookie. Try a hard refresh or clear site data for this host, then reload.
            </p>
          ) : null}
          <LoginForm
            showAuthSecretMissing={showAuthSecretMissing}
            showDevInsecureAuthHint={process.env.NODE_ENV === "development"}
            message={message ?? undefined}
            nextPath={nextPath}
          />
        </div>
        <p className="text-center text-xs text-zinc-500">
          After signing in you are redirected to the matches home page.
        </p>
      </div>
    </div>
  );
}
