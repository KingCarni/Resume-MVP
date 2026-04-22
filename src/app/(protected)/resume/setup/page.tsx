// src/app/(protected)/resume/setup/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

import ResumeMvp from "@/components/ResumeMvp";
import DashboardShell from "@/components/layout/DashboardShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export default async function ResumeSetupPage() {
  if (await hasExistingResumeProfile()) {
    redirect("/resume");
  }

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
          <Link href="/jobs" className="shell-secondary-btn">
            Browse Jobs
          </Link>
          <Link href="/jobs/saved" className="shell-secondary-btn">
            Saved Jobs
          </Link>
          <Link href="/account" className="shell-secondary-btn">
            Account
          </Link>
        </div>
      }
    >
      <div className="text-black dark:text-white">
        <ResumeMvp mode="setup" />
      </div>
    </DashboardShell>
  );
}
