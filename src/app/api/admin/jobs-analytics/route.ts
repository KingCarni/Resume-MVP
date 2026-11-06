import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin";
import { getJobsAnalyticsSummary } from "@/lib/analytics/jobsDashboard";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const { isAdmin, email } = await getAdminSession();

  if (!isAdmin) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  const url = new URL(req.url);
  const days = url.searchParams.get("days");
  const summary = await getJobsAnalyticsSummary(days);

  return json({
    ok: true,
    email,
    summary,
  });
}
