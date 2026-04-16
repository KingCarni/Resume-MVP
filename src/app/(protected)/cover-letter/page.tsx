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

          {/* Simple header button (NOT the big component) */}
          <Link
          href="/buy-credits"
          className="shell-primary-btn"
        >
          Buy Credits
        </Link>

          <a
            href="https://git-a-job.com/donate"
            target="_blank"
            rel="noreferrer"
            className="shell-secondary-btn"
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
