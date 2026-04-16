import Link from "next/link";
import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  topRight?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
};

export default function DashboardShell({
  title,
  subtitle,
  topRight,
  hideHeader,
  children,
}: Props) {
  return (
    <main className="min-h-screen pb-10">
      <div className="shell-wrap py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="shell-nav-link">
              Home
            </Link>
            <Link href="/jobs" className="shell-nav-link">
              Jobs
            </Link>
            <Link href="/resume" className="shell-nav-link">
              Resume
            </Link>
            <Link href="/cover-letter" className="shell-nav-link">
              Cover Letter
            </Link>
            <Link href="/account" className="shell-nav-link">
              Account
            </Link>
          </div>

          {topRight ? <div className="flex flex-wrap items-center justify-end gap-2">{topRight}</div> : null}
        </div>

        <section className="shell-panel overflow-hidden">
          {!hideHeader ? (
            <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),rgba(15,23,42,0.05)_52%,rgba(8,145,178,0.06))] px-6 py-8 sm:px-8 lg:px-10">
              <p className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Workspace</p>
              <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                  {subtitle}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
