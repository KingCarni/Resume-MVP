import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import CreditsPill from "@/components/Billing/CreditsPill";
import ResumeMvp from "@/components/ResumeMvp";
import DashboardShell from "@/components/layout/DashboardShell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export default async function Page() {
  if (await shouldUseSetupMode()) {
    redirect("/resume/setup");
  }

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
