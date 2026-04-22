import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import CreditsPill from "@/components/Billing/CreditsPill";
import ResumeMvp from "@/components/ResumeMvp";
import DashboardShell from "@/components/layout/DashboardShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SearchParamsValue = string | string[] | undefined;

async function shouldUseSetupMode() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return false;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      _count: {
        select: {
          resumeProfiles: true,
        },
      },
    },
  });

  return !!user?.id && user._count.resumeProfiles === 0;
}

function readParam(value: SearchParamsValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildBuyCreditsHref(searchParams: Record<string, SearchParamsValue>) {
  const jobId = readParam(searchParams.jobId).trim();
  if (!jobId) return "/buy-credits";

  const params = new URLSearchParams({
    source: "jobs",
    route: "/resume",
    jobId,
    mode: readParam(searchParams.bundle) === "apply-pack" ? "apply_pack" : "resume",
  });

  const resumeProfileId = readParam(searchParams.resumeProfileId).trim();
  if (resumeProfileId) params.set("resumeProfileId", resumeProfileId);

  return `/buy-credits?${params.toString()}`;
}

export default async function Page(props: {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
}) {
  if (await shouldUseSetupMode()) {
    redirect("/resume/setup");
  }

  const searchParams = (await props.searchParams) ?? {};
  const buyCreditsHref = buildBuyCreditsHref(searchParams);

  return (
    <DashboardShell
      title="Resume Compiler"
      subtitle="Build, rewrite, and export a resume that matches your target job."
      topRight={
        <div className="flex items-center gap-2">
          <CreditsPill />

          <Link href="/jobs/saved" className="shell-secondary-btn">
            Saved Jobs
          </Link>

          <Link href={buyCreditsHref} className="shell-primary-btn">
            Buy Credits
          </Link>

          <a
            href="/account/donate"
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
