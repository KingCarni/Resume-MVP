import Link from "next/link";
import { redirect } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import { getAdminSession } from "@/lib/admin";
import { getJobsAnalyticsSummary } from "@/lib/analytics/jobsDashboard";

function cardTone(index: number) {
  return index % 2 === 0
    ? "border-cyan-400/20 bg-cyan-500/10"
    : "border-white/10 bg-white/5";
}

type SearchParamsValue = string | string[] | undefined;

function readDays(value: SearchParamsValue) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(String(raw ?? "").trim());
  if (!Number.isFinite(parsed)) return 30;
  return parsed;
}

export default async function JobsAnalyticsAdminPage(props: {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
}) {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) {
    redirect("/account");
  }

  const searchParams = (await props.searchParams) ?? {};
  const days = readDays(searchParams.days);
  const summary = await getJobsAnalyticsSummary(days);

  return (
    <DashboardShell
      title="Jobs analytics dashboard"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {summary.cards.map((card, index) => (
          <div
            key={card.label}
            className={`rounded-3xl border p-5 shadow-[0_20px_55px_rgba(2,6,23,0.25)] ${cardTone(index)}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
              {card.label}
            </p>
            <div className="mt-3 text-3xl font-black text-white">{card.value}</div>
            {card.subtext ? (
              <p className="mt-3 text-sm leading-6 text-slate-300">{card.subtext}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        <span className="font-semibold text-white">Range</span>
        {[7, 30, 90].map((option) => {
          const active = summary.range.days === option;
          return (
            <Link
              key={option}
              href={`/admin/jobs-analytics?days=${option}`}
              className={active ? "shell-primary-btn" : "shell-secondary-btn"}
            >
              {option}d
            </Link>
          );
        })}
        <span className="ml-auto text-xs text-slate-400">
          {new Date(summary.range.startAt).toLocaleString("en-CA")} →{" "}
          {new Date(summary.range.endAt).toLocaleString("en-CA")}
        </span>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
            Funnel metrics
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <tbody>
                {[
                  ["Feed views", summary.funnel.feedViews],
                  ["Unique jobs-active users", summary.funnel.uniqueJobsActiveUsers],
                  ["Job detail views", summary.funnel.detailViews],
                  ["Unique detail users", summary.funnel.uniqueDetailUsers],
                  ["Save clicks", `${summary.funnel.saveClicks} (${summary.funnel.saveRatePct}%)`],
                  ["Tailor Resume clicks", summary.funnel.tailorResumeClicks],
                  ["Generate Cover Letter clicks", summary.funnel.coverLetterClicks],
                  ["Tailor Both clicks", summary.funnel.tailorBothClicks],
                  ["Paid jobs actions", summary.funnel.paidJobsActions],
                  ["Paid action users", summary.funnel.paidActionUsers],
                  [
                    "Paid action rate after detail",
                    `${summary.funnel.paidActionRateAfterDetailPct}%`,
                  ],
                  ["Bundle share of paid actions", `${summary.funnel.bundleSharePct}%`],
                ].map(([label, value]) => (
                  <tr key={String(label)} className="border-t border-white/10 first:border-t-0">
                    <th className="px-0 py-3 font-semibold text-white">{label}</th>
                    <td className="px-0 py-3 text-right text-slate-300">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
            Monetization + retention
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <tbody>
                {[
                  ["Jobs charged credits (proxy)", summary.monetization.jobsChargedCreditsProxy],
                  ["Total credits spent (all product)", summary.monetization.totalCreditsSpent],
                  ["Jobs-attributed checkout starts", summary.monetization.jobsAttributedCheckoutStarts],
                  ["Jobs-attributed purchases", summary.monetization.jobsAttributedPurchases],
                  [
                    "Jobs-attributed purchased credits",
                    summary.monetization.jobsAttributedPurchasedCredits,
                  ],
                  [
                    "Repeat jobs visitors within 7d",
                    `${summary.retention.repeatJobsVisitors7d} (${summary.retention.repeatJobsVisitorRatePct}%)`,
                  ],
                  ["Jobs event rows analyzed", summary.eventCount],
                  ["Ledger rows analyzed", summary.ledgerRowCount],
                ].map(([label, value]) => (
                  <tr key={String(label)} className="border-t border-white/10 first:border-t-0">
                    <th className="px-0 py-3 font-semibold text-white">{label}</th>
                    <td className="px-0 py-3 text-right text-slate-300">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
            Event mix
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="px-0 py-2">Event</th>
                  <th className="px-0 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {summary.eventsByName.map((item) => (
                  <tr key={item.event} className="border-t border-white/10 first:border-t-0">
                    <td className="px-0 py-2 text-slate-200">{item.event}</td>
                    <td className="px-0 py-2 text-right text-slate-300">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
            Monthly trend
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <th className="px-0 py-2">Month</th>
                  <th className="px-0 py-2 text-right">Jobs charged (proxy)</th>
                  <th className="px-0 py-2 text-right">Total spend</th>
                  <th className="px-0 py-2 text-right">Purchased credits</th>
                </tr>
              </thead>
              <tbody>
                {summary.monthlyTrend.map((item) => (
                  <tr key={item.month} className="border-t border-white/10 first:border-t-0">
                    <td className="px-0 py-2 text-slate-200">{item.month}</td>
                    <td className="px-0 py-2 text-right text-slate-300">{item.jobsChargedCreditsProxy}</td>
                    <td className="px-0 py-2 text-right text-slate-300">{item.totalCreditsSpent}</td>
                    <td className="px-0 py-2 text-right text-slate-300">{item.purchasedCredits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-3xl border border-white/10 bg-slate-950/40 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
          Notes / interpretation guardrails
        </p>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
          {summary.notes.map((note) => (
            <li key={note} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              {note}
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}
