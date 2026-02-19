// src/app/cover-letter/page.tsx
import CoverLetterGenerator from "@/components/CoverLetterGenerator";
import DashboardShell from "@/components/layout/DashboardShell";

export default function CoverLetterPage() {
  return (
    <DashboardShell
      title="Cover Letter Generator"
      subtitle="Generate a tailored cover letter that matches your resume and the job post."
    >
      <CoverLetterGenerator />
    </DashboardShell>
  );
}
