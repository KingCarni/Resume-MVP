// src/app/resume/page.tsx
import ResumeMvp from "@/components/ResumeMvp";
import DashboardShell from "@/components/layout/DashboardShell";

export default function Page() {
  return (
    <DashboardShell
      title="Resume Compiler"
      subtitle="Build, rewrite, and export a resume that matches your target job."
    >
      <ResumeMvp />
    </DashboardShell>
  );
}
