"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import GitAJobLogo from "@/components/layout/GitAJobLogo";

type NavItem = {
  href: string;
  label: string;
};

type Props = {
  brandLabel?: string;
  brandHref?: string;
  navItems: NavItem[];
  children?: ReactNode;
};

export default function MobileHeaderMenu({ brandHref = "/", navItems, children }: Props) {
  return (
    <details className="group rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl md:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-white marker:hidden [&::-webkit-details-marker]:hidden">
        <span onClick={(event) => event.stopPropagation()} className="min-w-0">
          <GitAJobLogo href={brandHref} imageClassName="h-9 w-auto max-w-[180px] object-contain" />
        </span>
        <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 transition group-open:border-cyan-400/30 group-open:text-cyan-100">
          Menu
        </span>
      </summary>
      <div className="mt-4 grid gap-3 border-t border-white/10 pt-4">
        <nav className="grid gap-2">
          {navItems.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-400/40 hover:bg-slate-800">
              {item.label}
            </Link>
          ))}
        </nav>
        {children ? <div className="grid gap-2 border-t border-white/10 pt-3 [&>*]:w-full [&_a]:w-full [&_button]:w-full">{children}</div> : null}
      </div>
    </details>
  );
}
