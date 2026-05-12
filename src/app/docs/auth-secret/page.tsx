import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AUTH_SECRET setup",
};

function extractAuthSecretSection(): string {
  const full = readFileSync(join(process.cwd(), "DEPLOY.md"), "utf8");
  const needle = "## AUTH_SECRET";
  const start = full.indexOf(needle);
  if (start === -1) {
    return `${needle}\n\n(Reference section missing from DEPLOY.md — open DEPLOY.md in the repo.)`;
  }
  const rest = full.slice(start);
  const next = rest.indexOf("\n## ", 4);
  return next === -1 ? rest : rest.slice(0, next);
}

export default function AuthSecretDocsPage() {
  const body = extractAuthSecretSection();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-zinc-100">
      <p className="mb-6 text-sm text-zinc-400">
        <Link
          href="/login"
          className="text-[color:color-mix(in_oklab,var(--ticketing-accent)_72%,white_12%)] hover:text-[color:color-mix(in_oklab,var(--ticketing-accent)_78%,white_10%)]"
        >
          ← Back to sign in
        </Link>
      </p>
      <article
        id="auth-secret--session-signing"
        className="rounded-xl border border-white/10 bg-zinc-950/80 p-6 shadow-lg"
      >
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">{body}</pre>
      </article>
    </div>
  );
}
