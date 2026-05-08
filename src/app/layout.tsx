import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/actions/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Events — Matches",
  description: "Football tournament matches with catalogue pref IDs",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {session ? (
          <div className="flex items-center justify-end gap-3 border-b border-white/[0.08] bg-zinc-950/90 px-4 py-2 text-sm text-zinc-300">
            <span className="truncate text-zinc-400">
              Signed in as <span className="font-medium text-zinc-200">{session.name}</span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.12]"
              >
                Log out
              </button>
            </form>
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
