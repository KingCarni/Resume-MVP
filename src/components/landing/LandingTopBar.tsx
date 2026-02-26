// src/components/landing/LandingTopBar.tsx
"use client";

import Link from "next/link";
import React from "react";

type Props = {
  isAuthed: boolean;
  credits: number;
  signOutHref: string; // keep server-generated /api/auth/signout?... so callbackUrl is correct
};

export default function LandingTopBar({ isAuthed, credits, signOutHref }: Props) {
  // Logged out: keep marketing-style header (simple)
  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-6xl px-6 pt-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="rounded-xl border border-white/40 bg-white/25 px-3 py-2 text-sm font-black text-black shadow-sm backdrop-blur hover:bg-white/35"
          >
            Git-a-Job
          </Link>

          <Link
            href="/resume"
            className="rounded-xl bg-black px-4 py-2 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
          >
            Try it free
          </Link>
        </div>
      </div>
    );
  }

  // Logged in: app-style nav + credits + actions, plus Sign Out on the left
  return (
    <div className="mx-auto max-w-6xl px-6 pt-10">
      <div className="flex items-center justify-between gap-4">
        {/* Left */}
        <Link
          href={signOutHref}
          className="rounded-xl border border-white/40 bg-white/25 px-4 py-2 text-sm font-black text-black shadow-sm backdrop-blur transition-all duration-200 hover:bg-white/35 hover:scale-[1.02]"
        >
          Sign Out
        </Link>

        {/* Center + Right */}
        <div className="flex flex-1 items-center justify-between gap-4">
          {/* App nav (pill buttons) */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/resume"
              className="rounded-full bg-black px-4 py-2 text-xs font-black text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-neutral-800"
            >
              Resume
            </Link>
            <Link
              href="/cover-letter"
              className="rounded-full bg-black px-4 py-2 text-xs font-black text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-neutral-800"
            >
              Cover Letter
            </Link>
            <Link
              href="/account"
              className="rounded-full bg-black px-4 py-2 text-xs font-black text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-neutral-800"
            >
              Account
            </Link>
          </div>

          {/* Credits + actions */}
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-black px-4 py-2 text-xs font-black text-white shadow-md">
              Credits: {credits}
            </div>

            {/* Reload */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              aria-label="Reload credits"
              title="Reload"
              className="rounded-full bg-black px-3 py-2 text-xs font-black text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-neutral-800"
            >
              ↻
            </button>

            <Link
              href="/buy-credits"
              className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-emerald-800"
            >
              Buy Credits
            </Link>

            <a
              href="https://git-a-job.com/donate"
              className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow-md transition-transform hover:scale-[1.02] hover:bg-emerald-800"
              target="_blank"
              rel="noreferrer"
            >
              Donate
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}