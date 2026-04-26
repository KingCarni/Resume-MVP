import Link from "next/link";
import { redirect } from "next/navigation";

import JobMatchWarmupsAdminTable from "@/components/admin/JobMatchWarmupsAdminTable";
import DashboardShell from "@/components/layout/DashboardShell";
import { getAdminSession } from "@/lib/admin";
import { listJobMatchWarmupAdminRows } from "@/lib/jobs/warmup";

type SearchParamsValue = string | string[] | undefined;

function firstValue(value: SearchParamsValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function JobMatchWarmupsAdminPage(props: {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
}) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) {
    redirect("/account");
  }

  const searchParams = (await props.searchParams) ?? {};
  const status = firstValue(searchParams.status) ?? "all";
  const rows = await listJobMatchWarmupAdminRows({
    status:
      status === "pending" ||
      status === "running" ||
      status === "ready" ||
      status === "failed" ||
      status === "stale"
        ? status
        : "all",
    limit: 100,
  });

  return (
    <DashboardShell
      title="JobMatch warmup monitor"
    >
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm leading-6 text-slate-300">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
          Purpose
        </p>
        <p className="mt-3">
          This view is for monitoring stuck/failed best-match warmups and safely nudging them back
          into a recoverable state. It is intentionally operational, not pretty.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["all", "pending", "running", "failed", "stale", "ready"].map((value) => {
            const active = status === value;
            return (
              <Link
                key={value}
                href={value === "all" ? "/admin/job-match-warmups" : `/admin/job-match-warmups?status=${value}`}
                className={active ? "shell-primary-btn" : "shell-secondary-btn"}
              >
                {value}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <JobMatchWarmupsAdminTable initialRows={rows} />
      </div>
    </DashboardShell>
  );
}
