// src/app/(protected)/cover-letter/page.tsx
import CoverLetterGenerator from "@/components/CoverLetterGenerator";
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import Link from "next/link";

export default function Page() {
  return (
    <DashboardShell
      title="Cover Letter Generator"
      subtitle="Generate a tailored cover letter that matches your resume and the job post."
      topRight={
        <div className="flex items-center gap-2">
          <CreditsPill />

          {/* Simple button-style link (do NOT render the full BuyCredits component here) */}
          <Link
            href="/BuyCreditsButton"
            className="rounded-xl border border-black/10 bg-black/70 px-3 py-2 text-sm font-extrabold text-black hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Buy credits
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
        <CoverLetterGenerator />
      </div>
    </DashboardShell>
  );
}