import Link from "next/link";
import { getServerSession } from "next-auth";

import LandingFooter from "@/components/landing/LandingFooter";
import LandingTopBar from "@/components/landing/LandingTopBar";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const workflowSteps = [
  {
    step: "01",
    title: "Match to real jobs",
    body: "Start with the feed, not a blank document. Pull in current roles and sort by believable fit.",
  },
  {
    step: "02",
    title: "See where you fit",
    body: "Read the overlap, title fit, and likely gaps before you spend time tailoring.",
  },
  {
    step: "03",
    title: "Tailor faster",
    body: "Use the resume and cover letter tools once you already know which role is worth chasing.",
  },
];

const trustPoints = [
  {
    title: "Matching starts from the role itself.",
    body: "Git-a-Job scores against the actual title, requirements, and responsibilities instead of giving generic resume advice.",
  },
  {
    title: "You can see the fit before you spend.",
    body: "Title fit, skill overlap, seniority, location, and likely gaps are visible up front so weaker roles are easier to skip.",
  },
  {
    title: "Tailoring starts with context already loaded.",
    body: "When a role is worth chasing, that job context carries into resume and cover-letter work so you are not starting from a blank page.",
  },
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  let credits = 0;
  if (session?.user?.id) {
    const agg = await prisma.creditsLedger.aggregate({
      where: { userId: session.user.id },
      _sum: { delta: true },
    });
    credits = agg._sum.delta ?? 0;
  }

  const signOutHref = "/api/auth/signout?callbackUrl=/";
  const primaryHref = session ? "/jobs" : "/resume";
  const primaryLabel = session ? "Open Job Match" : "Start Free";

  return (
    <main className="min-h-screen pb-10">
      <LandingTopBar isAuthed={!!session} credits={credits} signOutHref={signOutHref} />

      <div className="shell-wrap pt-6">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-slate-950/80 px-6 py-10 shadow-[0_30px_90px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:px-8 lg:px-12 lg:py-14">
          <div className="absolute inset-y-0 right-0 hidden w-[44%] bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.3),transparent_36%),linear-gradient(180deg,rgba(14,165,233,0.12),rgba(15,23,42,0))] lg:block" />

          <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] lg:items-end">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold tracking-[0.3em] text-cyan-200 uppercase">
                Jobs-first application workflow
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-none tracking-tight text-white sm:text-5xl lg:text-6xl">
                Match to real roles. See the fit. Tailor only the jobs worth chasing.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Git-a-Job now works best as one connected shell: discover jobs, read believable overlap, and move into resume or cover letter tailoring with context already in place.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={primaryHref} className="shell-primary-btn">
                  {primaryLabel}
                </Link>
                <Link href="/jobs" className="shell-secondary-btn">
                  Browse Live Roles
                </Link>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Match</div>
                  <div className="mt-3 text-2xl font-bold text-white">Real jobs</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Stop tailoring blind. Start from the role list and the actual description.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Trust</div>
                  <div className="mt-3 text-2xl font-bold text-white">Believable fit</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Stronger signals, cleaner gaps, and less random scoring noise.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Tailor</div>
                  <div className="mt-3 text-2xl font-bold text-white">Faster output</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Resume and cover letter tools stay inside the same hiring flow.</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[2rem] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(14,165,233,0.16),rgba(15,23,42,0.88))] p-6 shadow-[0_24px_80px_rgba(8,145,178,0.18)]">
                <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.24em] text-cyan-100 uppercase">
                  <span>Match panel</span>
                  <span>2.0 shell</span>
                </div>
                <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5">
                  <div className="text-xs tracking-[0.2em] text-slate-500 uppercase">Overall fit</div>
                  <div className="mt-3 flex items-end gap-3">
                    <div className="text-5xl font-bold text-white">78%</div>
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-emerald-200 uppercase">
                      Strong
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    Match quality is strongest when the workflow starts with the role, then moves into tailoring from there.
                  </p>
                  <div className="mt-6 space-y-3">
                    {[
                      ["Title fit", "84%"],
                      ["Skill overlap", "71%"],
                      ["Likely gaps", "Cleaned"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span className="text-sm text-slate-300">{label}</span>
                        <span className="text-sm font-semibold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="shell-panel px-6 py-8 sm:px-8">
            <div className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Workflow</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">Discover, evaluate, tailor.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              The best improvement to Git-a-Job is not a louder landing page. It is a clearer path from role discovery into the documents that matter.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {workflowSteps.map((item) => (
              <div key={item.step} className="shell-panel px-5 py-6">
                <div className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">{item.step}</div>
                <h3 className="mt-4 text-xl font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_78%_22%,rgba(59,130,246,0.14),transparent_28%),rgba(2,6,23,0.7)] px-6 py-8 shadow-[0_26px_80px_rgba(2,6,23,0.35)] sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 px-6 py-8 sm:px-8">
            <div className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Why it works</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">Why the match feels usable.</h2>
            <div className="mt-6 space-y-4">
              {trustPoints.map((item) => (
                <div key={item.title} className="flex gap-3 rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4">
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300" />
                  <div>
                    <h3 className="text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/60 px-6 py-8 sm:px-8">
            <div className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Product shell</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">One workflow from discovery to tailoring.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Browse live roles, open the match panel, and move into resume or cover-letter tailoring without losing the job context that made the role worth opening.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/account" className="shell-secondary-btn">
                Open Account Hub
              </Link>
              <Link href="/resume" className="shell-secondary-btn">
                Open Resume Builder
              </Link>
              <Link href="/cover-letter" className="shell-secondary-btn">
                Open Cover Letter
              </Link>
            </div>
          </div>
          </div>
        </section>

        <section className="mt-8 shell-panel px-6 py-10 text-center sm:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Next step</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Start from the roles you actually want, then tailor with context already loaded.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              Git-a-Job is strongest when the workflow starts with real job matching and ends with tighter application output.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={primaryHref} className="shell-primary-btn">
                {primaryLabel}
              </Link>
              <Link href="/jobs" className="shell-secondary-btn">
                Explore Jobs
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-8">
          <LandingFooter />
        </div>
      </div>
    </main>
  );
}
