import { getServerSession } from "next-auth";
import Link from "next/link";

import AdminDebugPanel from "@/components/admin/AdminDebugPanel";
import { authOptions } from "@/lib/auth";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"];

function isAdmin(email: string | null | undefined) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return !!normalized && ADMIN_EMAILS.includes(normalized);
}

export default async function AdminDebugPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return (
      <main className="min-h-screen px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-2xl font-bold">Unauthorized</h1>
          <p className="mt-3 text-slate-300">Sign in with the admin account to use this page.</p>
          <Link href="/account" className="mt-6 inline-flex rounded-2xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950">Back to account</Link>
        </div>
      </main>
    );
  }

  if (!isAdmin(session.user.email)) {
    return (
      <main className="min-h-screen px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-rose-400/30 bg-rose-500/10 p-8">
          <h1 className="text-2xl font-bold">Forbidden</h1>
          <p className="mt-3 text-rose-100">This page is restricted to the Git-a-Job admin account.</p>
          <Link href="/account" className="mt-6 inline-flex rounded-2xl border border-white/10 bg-slate-900 px-5 py-3 font-semibold text-white">Back to account</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10 text-white">
      <div className="shell-wrap py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="shell-nav-link">Home</Link>
            <Link href="/jobs" className="shell-nav-link">Jobs</Link>
            <Link href="/account" className="shell-nav-link">Account</Link>
            <Link href="/admin/debug" className="shell-nav-link">Admin Debug</Link>
          </div>
          <Link href="/buy-credits" className="shell-primary-btn">Buy Credits</Link>
        </div>

        <div className="shell-panel overflow-hidden">
          <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),rgba(15,23,42,0.05)_52%,rgba(8,145,178,0.06))] px-6 py-8 sm:px-8 lg:px-10">
            <p className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Admin</p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Debug menu</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Internal account, credit, donation, and setup recovery tools. Server-side admin checks are enforced on every request.
            </p>
          </div>
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <AdminDebugPanel />
          </div>
        </div>
      </div>
    </main>
  );
}
