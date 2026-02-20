// src/app/(protected)/resume/page.tsx
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import ResumeMvp from "@/components/ResumeMvp";
import Link from "next/link";

export default function Page() {
  return (
    <DashboardShell
      title="Resume Compiler"
      subtitle="Build, rewrite, and export a resume that matches your target job."
      topRight={
        <div className="flex items-center gap-2">
          <CreditsPill />

          <Link
            href="/buy-credits"
            className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-700"
          >
            Buy Credits
          </Link>

          <a
            href="https://git-a-job.com/donate"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-700"
          >
            Donate
          </a>
        </div>
      }
    >
      <div className="text-black dark:text-white">
        <ResumeMvp />
      </div>
    </DashboardShell>
  );
}