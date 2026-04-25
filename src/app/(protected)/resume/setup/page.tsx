// src/app/(protected)/resume/setup/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import ResumeMvp from "@/components/ResumeMvp";
import DashboardShell from "@/components/layout/DashboardShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SETUP_REQUIRED_REASON_COPY } from "@/lib/resumeProfiles/profileGate";

async function hasExistingResumeProfile() {
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

  return !!user?.id && user._count.resumeProfiles > 0;
}

type SearchParamsValue = string | string[] | undefined;

function readParam(value: SearchParamsValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ResumeSetupPage(props: {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
}) {
  if (await hasExistingResumeProfile()) {
    redirect("/resume");
  }

  const searchParams = (await props.searchParams) ?? {};
  const reason = readParam(searchParams.reason).trim();
  const setupPrompt = reason ? SETUP_REQUIRED_REASON_COPY[reason] ?? SETUP_REQUIRED_REASON_COPY.jobs : null;

  return (
    <DashboardShell
      title="Resume Setup"
      subtitle="Create your base Git-a-Job resume for free. Once this is done, you can tailor it per role."
      topRight={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/buy-credits" className="shell-primary-btn">
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
          <Link href="/account" className="shell-secondary-btn">
            Account
          </Link>
        </div>
      }
    >
      <div className="text-black dark:text-white">
        {setupPrompt ? (
          <div className="mb-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm leading-6 text-cyan-50 shadow-[0_18px_50px_rgba(8,145,178,0.12)]">
            <div className="font-extrabold text-white">Resume setup required</div>
            <p className="mt-1 text-cyan-100/90">{setupPrompt}</p>
          </div>
        ) : null}
        <ResumeMvp mode="setup" />
      </div>
    </DashboardShell>
  );
}
