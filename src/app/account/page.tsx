import { getServerSession } from "next-auth";
import Link from "next/link";

import AccountProfileHub from "@/components/account/AccountProfileHub";
import { authOptions } from "@/lib/auth";

const ADMIN_EMAIL = "gitajob.com@gmail.com";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  const isAdmin = email === ADMIN_EMAIL;

  return (
    <main className="min-h-screen pb-10 text-white">
      <div className="shell-wrap py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="shell-nav-link">Home</Link>
            <Link href="/jobs" className="shell-nav-link">Jobs</Link>
            <Link href="/resume" className="shell-nav-link">Resume</Link>
            <Link href="/cover-letter" className="shell-nav-link">Cover Letter</Link>
            <Link href="/account" className="shell-nav-link">Account</Link>
            <Link href="/jobs/saved" className="shell-nav-link">Saved Jobs</Link>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/buy-credits" className="shell-primary-btn">Buy Credits</Link>
            <Link href="/account/donate" className="shell-secondary-btn">Donate</Link>
          </div>
        </div>

        <div className="shell-panel overflow-hidden">
          <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),rgba(15,23,42,0.05)_52%,rgba(8,145,178,0.06))] px-6 py-8 sm:px-8 lg:px-10">
            <p className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Account hub</p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Profile, credits, donations, and resume data in one place.</h1>
          </div>

          <div className="px-4 py-6 sm:px-6 lg:px-8">
        <AccountProfileHub
          email={String(session?.user?.email ?? "").trim()}
          isAdmin={isAdmin}
        />
          </div>
        </div>
      </div>
    </main>
  );
}
