import CoverLetterGenerator from "@/components/CoverLetterGenerator";
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import { requireResumeProfileForRoute } from "@/lib/resumeProfiles/profileGate";

export default async function Page() {
  await requireResumeProfileForRoute("cover-letter");

  return (
    <DashboardShell
      title="Cover Letter Generator"
      subtitle="Generate a tailored cover letter that matches your resume and the job post."
      topRight={<CreditsPill />}
    >
      <div className="text-black dark:text-white">
        <CoverLetterGenerator />
      </div>
    </DashboardShell>
  );
}
