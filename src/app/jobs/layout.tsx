import type { ReactNode } from "react";

import { requireResumeProfileForRoute } from "@/lib/resumeProfiles/profileGate";

export default async function JobsLayout({ children }: { children: ReactNode }) {
  await requireResumeProfileForRoute("jobs");
  return <>{children}</>;
}
