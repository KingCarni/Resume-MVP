"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type AppHeaderNavItem = {
  href: string;
  label: string;
};

type Props = {
  navItems?: AppHeaderNavItem[];
  menuItems?: AppHeaderNavItem[];
  children?: ReactNode;
  brandHref?: string;
  logoSrc?: string;
  logoAlt?: string;
};

const DEFAULT_NAV_ITEMS: AppHeaderNavItem[] = [
  { href: "/", label: "Home" },
  { href: "/jobs", label: "Jobs" },
  { href: "/resume", label: "Resume" },
  { href: "/cover-letter", label: "Cover Letter" },
  { href: "/account", label: "Account" },
];

const DEFAULT_MENU_ITEMS: AppHeaderNavItem[] = [
  { href: "/jobs/saved", label: "Saved Jobs" },
  { href: "/buy-credits", label: "Buy Credits" },
  { href: "/account/donate", label: "Donate" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppHeader({
  navItems = DEFAULT_NAV_ITEMS,
  menuItems = DEFAULT_MENU_ITEMS,
  children,
  brandHref = "/",
  logoSrc = "/git-a-job-logo-transparent.png",
  logoAlt = "Git-a-Job",
}: Props) {
  const pathname = usePathname() || "/";
  const filteredNavItems = navItems.filter(
    (item) => !isActivePath(pathname, item.href),
  );
  const filteredMenuItems = menuItems.filter(
    (item) => !isActivePath(pathname, item.href),
  );

  return (
    <header className="shell-wrap relative z-[9999] pt-5">
      <details className="group relative z-[9999] rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-white marker:hidden [&::-webkit-details-marker]:hidden">
          <Link
            href={brandHref}
            className="inline-flex min-w-0 items-center gap-2"
            onClick={(event) => event.stopPropagation()}
            aria-label="Git-a-Job home"
          >
            <Image
              src={logoSrc}
              alt={logoAlt}
              width={154}
              height={42}
              priority
              className="h-8 w-auto max-w-[170px] object-contain"
            />
          </Link>
          <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 transition group-open:border-cyan-400/30 group-open:text-cyan-100">
            Menu
          </span>
        </summary>

        <div className="relative z-[10000] mt-4 grid gap-3 border-t border-white/10 pt-4">
          <nav className="grid gap-2">
            {filteredNavItems.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-400/40 hover:bg-slate-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="grid gap-2 border-t border-white/10 pt-3 [&_a]:w-full [&_button]:w-full">
            {children}
            {filteredMenuItems.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="shell-secondary-btn"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </details>

      <div className="relative z-[9999] hidden items-center justify-between gap-4 rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:px-6 md:flex">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href={brandHref}
            className="inline-flex shrink-0 items-center"
            aria-label="Git-a-Job home"
          >
            <Image
              src={logoSrc}
              alt={logoAlt}
              width={154}
              height={42}
              priority
              className="h-8 w-auto object-contain"
            />
          </Link>

          <nav className="hidden min-w-0 items-center gap-2 lg:flex">
            {filteredNavItems.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="shell-nav-link whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <details className="group relative z-[10000]">
            <summary className="shell-secondary-btn cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <div className="absolute right-0 z-[10001] mt-3 grid min-w-[230px] gap-2 rounded-3xl border border-white/10 bg-slate-950/95 p-3 shadow-[0_22px_60px_rgba(2,6,23,0.65)] backdrop-blur-xl">
              <div className="grid gap-2 lg:hidden">
                {filteredNavItems.map((item) => (
                  <Link
                    key={`${item.href}-${item.label}-dropdown`}
                    href={item.href}
                    className="shell-secondary-btn w-full justify-center"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              {children ? (
                <div className="grid gap-2 border-b border-white/10 pb-2 [&_a]:w-full [&_button]:w-full">
                  {children}
                </div>
              ) : null}

              {filteredMenuItems.map((item) => (
                <Link
                  key={`${item.href}-${item.label}-menu`}
                  href={item.href}
                  className="shell-secondary-btn w-full justify-center"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
