import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const SETUP_REQUIRED_REASON_COPY: Record<string, string> = {
  jobs: "Finish your resume setup first so Git-a-Job can match you against real roles.",
  "saved-jobs": "Finish your resume setup first so your saved jobs and match scores have a profile to use.",
  "job-detail": "Finish your resume setup first so this job can be scored against your profile.",
  "cover-letter": "Finish your resume setup first so your cover letter can be grounded in your resume.",
};

export async function getCurrentUserResumeProfileCount() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return null;
  }

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

  if (!user?.id) {
    return 0;
  }

  return user._count.resumeProfiles;
}

export async function hasResumeProfileForCurrentUser() {
  const count = await getCurrentUserResumeProfileCount();
  return count != null && count > 0;
}

export async function requireResumeProfileForRoute(reason = "jobs") {
  const count = await getCurrentUserResumeProfileCount();

  if (count == null) {
    redirect("/api/auth/signin");
  }

  if (count <= 0) {
    const params = new URLSearchParams({ reason });
    redirect(`/resume/setup?${params.toString()}`);
  }
}
