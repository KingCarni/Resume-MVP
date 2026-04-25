"use client";

import Link from "next/link";

import AppHeader from "@/components/layout/AppHeader";

type Props = {
  isAuthed: boolean;
  credits: number;
  signOutHref: string;
};

export default function LandingTopBar({ isAuthed, credits, signOutHref }: Props) {
  const menuItems = isAuthed
    ? [
        { href: "/jobs/saved", label: "Saved Jobs" },
        { href: "/donate", label: "Donate" },
        { href: signOutHref, label: "Sign Out" },
      ]
    : [
        { href: "/jobs", label: "Browse Jobs" },
        { href: "/resume", label: "Start Free" },
        { href: "/donate", label: "Donate" },
      ];

  return (
    <AppHeader menuItems={menuItems}>
      {isAuthed ? (
        <>
          <div className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">
            Credits: {credits}
          </div>
          <Link href="/buy-credits" className="shell-primary-btn">
            Buy Credits
          </Link>
        </>
      ) : (
        <Link href="/buy-credits" className="shell-primary-btn">
          Buy Credits
        </Link>
      )}
    </AppHeader>
  );
}
