"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Matches", exact: true as const },
  { href: "/sb-listings", label: "SB Listings" },
  { href: "/sb-push-settings", label: "Push rules" },
  { href: "/listing-changes", label: "Changes" },
] as const;

function navLinkActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteTopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Main">
      {links.map((link) => {
        const active = navLinkActive(pathname, link.href, "exact" in link ? link.exact : false);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md bg-[color:color-mix(in_oklab,var(--ticketing-accent)_14%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 ring-1 ring-[color:color-mix(in_oklab,var(--ticketing-accent)_22%,transparent)]"
                : "rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 ring-1 ring-transparent hover:bg-white/[0.06] hover:text-zinc-100"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
