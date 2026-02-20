// src/components/layout/DashboardShell.tsx
import Link from "next/link";
import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  topRight?: React.ReactNode; // e.g. Credits pill
  children: React.ReactNode;
};

const shellCard =
  "rounded-3xl border border-white/30 bg-white/35 backdrop-blur-xl shadow-xl";

const navBtn =
  "rounded-xl bg-black px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-800";

export default function DashboardShell({ title, subtitle, topRight, children }: Props) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-400 via-emerald-300 to-blue-500">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className={`${shellCard} p-6 sm:p-10 text-black`}>
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">{title}</h1>
              {subtitle ? <p className="mt-2 text-sm text-black/70">{subtitle}</p> : null}
            </div>
          </div>

          {/* Top nav row + credits */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Link href="/" className={navBtn}>
                Toolbelt
              </Link>
              <Link href="/resume" className={navBtn}>
                Resume
              </Link>
              <Link href="/cover-letter" className={navBtn}>
                Cover Letter
              </Link>
              <Link href="/account" className={navBtn}>
                Account
              </Link>
            </div>

            {topRight ? <div className="flex items-center justify-start sm:justify-end">{topRight}</div> : null}
          </div>

          {/* Page content */}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
