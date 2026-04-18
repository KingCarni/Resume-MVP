import CoverLetterGenerator from "@/components/CoverLetterGenerator";
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import Link from "next/link";

type SearchParamsValue = string | string[] | undefined;

function readParam(value: SearchParamsValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildBuyCreditsHref(searchParams: Record<string, SearchParamsValue>) {
  const jobId = readParam(searchParams.jobId).trim();
  if (!jobId) return "/buy-credits";

  const params = new URLSearchParams({
    source: "jobs",
    route: "/cover-letter",
    jobId,
    mode: readParam(searchParams.bundle) === "apply-pack" ? "apply_pack" : "cover_letter",
  });

  const resumeProfileId = readParam(searchParams.resumeProfileId).trim();
  if (resumeProfileId) params.set("resumeProfileId", resumeProfileId);

  return `/buy-credits?${params.toString()}`;
}

export default async function Page(props: {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const buyCreditsHref = buildBuyCreditsHref(searchParams);

  return (
    <DashboardShell
      title="Cover Letter Generator"
      subtitle="Generate a tailored cover letter that matches your resume and the job post."
      topRight={
        <div className="flex items-center gap-2">
          <CreditsPill />

          <Link href={buyCreditsHref} className="shell-primary-btn">
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
