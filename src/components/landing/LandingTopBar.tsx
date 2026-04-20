"use client";

import Link from "next/link";

type Props = {
  isAuthed: boolean;
  credits: number;
  signOutHref: string;
};

export default function LandingTopBar({ isAuthed, credits, signOutHref }: Props) {
  return (
    <header className="shell-wrap pt-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg font-bold tracking-[0.08em] text-white sm:text-xl">
            Git-a-Job
          </Link>
          <div className="hidden items-center gap-2 md:flex">
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isAuthed ? (
            <>
              <div className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-100">
                Credits: {credits}
              </div>
              <Link href="/buy-credits" className="shell-primary-btn">
                Buy Credits
              </Link>
              <Link href="/donate" className="shell-secondary-btn">
                Donate
              </Link>
              <Link href="/jobs" className="shell-secondary-btn">
                Open Jobs
              </Link>
              <Link href={signOutHref} className="shell-secondary-btn">
                Sign Out
              </Link>
            </>
          ) : (
            <>
              <Link href="/buy-credits" className="shell-primary-btn">
                Buy Credits
              </Link>
              <Link href="/donate" className="shell-secondary-btn">
                Donate
              </Link>
              <Link href="/jobs" className="shell-secondary-btn">
                Browse Jobs
              </Link>
              <Link href="/resume" className="shell-secondary-btn">
                Start Free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
