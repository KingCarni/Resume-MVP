// src/app/(protected)/resume/page.tsx
import ResumeMvp from "@/components/ResumeMvp";
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";

export default function Page() {
  return (
    <DashboardShell
      title="Resume Compiler"
      subtitle="Build, rewrite, and export a resume that matches your target job."
      topRight={<CreditsPill />}
    >
      <div className="text-black dark:text-white">
        <ResumeMvp />
      </div>
    </DashboardShell>
  );
}