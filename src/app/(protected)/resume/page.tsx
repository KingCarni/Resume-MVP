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
        <ResumeMvp />
      </div>
    </DashboardShell>
  );
}
