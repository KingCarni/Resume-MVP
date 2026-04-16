import Link from "next/link";
import { getServerSession } from "next-auth";

import LandingFooter from "@/components/landing/LandingFooter";
import LandingTopBar from "@/components/landing/LandingTopBar";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const workflowSteps = [
  {
    step: "01",
    title: "Browse the live board",
    body: "Start with current roles already in the system instead of tailoring against a blank page or a pasted description.",
  },
  {
    step: "02",
    title: "Open the match panel",
    body: "Check title fit, skill overlap, seniority, location, and likely gaps before you spend credits on anything.",
  },
  {
    step: "03",
    title: "Tailor from the role",
    body: "Move into resume or cover-letter work with the job context already loaded so the output stays tied to a real opening.",
  },
];

const trustPoints = [
  {
    title: "Matching starts from the actual listing.",
    body: "Git-a-Job reads the role title, requirements, and responsibilities first, then compares your selected profile against that job instead of inventing generic advice.",
  },
  {
    title: "You can see the risk before you commit.",
    body: "Strong signals and likely gaps are visible up front, so weak-fit roles are easier to skip and stronger-fit roles are easier to prioritize.",
  },
  {
    title: "Job context carries into the paid tools.",
    body: "When you decide a role is worth chasing, that same job context can flow into resume and cover-letter tailoring so you are not restarting from scratch.",
  },
];

const productActions = [
  {
    title: "Job Match",
    body: "Browse the live board, open a role, and decide whether it deserves your time.",
    href: "/jobs",
  },
  {
    title: "Resume",
    body: "Use the selected role to steer resume work instead of rewriting blind.",
    href: "/resume",
  },
  {
    title: "Cover Letter",
    body: "Generate role-aware cover-letter drafts only after a real job passes the fit check.",
    href: "/cover-letter",
  },
  {
    title: "Account + Donations",
    body: "Credits, donation requests, and pool support all live in the account hub with manual review built in.",
    href: "/account",
  },
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  const [jobCount, creditAgg] = await Promise.all([
    prisma.job.count({
      where: {
        status: "active",
      },
    }),
    session?.user?.id
      ? prisma.creditsLedger.aggregate({
          where: { userId: session.user.id },
          _sum: { delta: true },
        })
      : Promise.resolve({ _sum: { delta: 0 } }),
  ]);

  const credits = creditAgg._sum.delta ?? 0;
  const signOutHref = "/api/auth/signout?callbackUrl=/";
  const primaryHref = "/jobs";
  const primaryLabel = session ? "Open Job Match" : "Browse Jobs";

  return (
    <main className="min-h-screen pb-10">
      <LandingTopBar isAuthed={!!session} credits={credits} signOutHref={signOutHref} />

      <div className="shell-wrap pt-6">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_78%_20%,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.08),transparent_36%),rgba(2,6,23,0.84)] px-6 py-10 shadow-[0_30px_90px_rgba(2,6,23,0.45)] backdrop-blur-xl sm:px-8 lg:px-12 lg:py-14">
          <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:items-end">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold tracking-[0.3em] text-cyan-200 uppercase">
                Jobs-first application workflow
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-none tracking-tight text-white sm:text-5xl lg:text-6xl">
                Match to real roles. See the fit. Tailor only the jobs worth chasing.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Git-a-Job works best when the workflow starts with a live job, shows believable fit, and only then moves into resume or cover-letter tailoring.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={primaryHref} className="shell-primary-btn">
                  {primaryLabel}
                </Link>
                <a href="#workflow" className="shell-secondary-btn">
                  See how it works
                </a>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Match</div>
                  <div className="mt-3 text-2xl font-bold text-white">Real roles</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Use the current job board instead of tailoring against a guess.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Trust</div>
                  <div className="mt-3 text-2xl font-bold text-white">Readable fit</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Title fit, overlap, and likely gaps are visible before you spend credits.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Tailor</div>
                  <div className="mt-3 text-2xl font-bold text-white">Context loaded</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Resume and cover-letter work can start from the role instead of from scratch.</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[2rem] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(14,165,233,0.16),rgba(15,23,42,0.92))] p-6 shadow-[0_24px_80px_rgba(8,145,178,0.18)]">
                <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/45 px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-[0.24em] text-cyan-100 uppercase">Current board</div>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-3xl font-bold text-white">{jobCount.toLocaleString()}</div>
                      <p className="mt-1 text-sm leading-6 text-slate-300">Active jobs currently available to score against live profiles.</p>
                    </div>
                    <Link href="/jobs" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold tracking-[0.18em] text-cyan-100 uppercase transition hover:border-cyan-300/30 hover:bg-cyan-400/10">
                      Open board
                    </Link>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs tracking-[0.2em] text-slate-500 uppercase">Match panel</div>
                    <div className="text-xs font-semibold tracking-[0.18em] text-cyan-100 uppercase">Live scoring view</div>
                  </div>
                  <div className="mt-3 flex items-end gap-3">
                    <div className="text-5xl font-bold text-white">78%</div>
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-emerald-200 uppercase">
                      Strong
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    The strongest roles show clear title alignment, visible overlap, and gaps that read like real next steps instead of random filler.
                  </p>
                  <div className="mt-6 space-y-3">
                    {[
                      ["Title fit", "84%"],
                      ["Skill overlap", "71%"],
                      ["Likely gaps", "Actionable"],
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

        <section id="workflow" className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="shell-panel px-6 py-8 sm:px-8">
            <div className="text-[11px] font-semibold tracking-[0.28em] text-cyan-200 uppercase">Workflow</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">Discover, evaluate, tailor.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              Git-a-Job is strongest when it helps you reject weak roles faster, focus on stronger ones, and carry the best job context forward into the paid tools.
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
                Browse the board, open the match panel, then move into resume, cover-letter, account, and donation actions without losing the job context that made the role worth opening.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {productActions.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-4 transition hover:border-cyan-300/20 hover:bg-cyan-400/[0.06]"
                  >
                    <div className="text-base font-semibold text-white">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
                  </Link>
                ))}
              </div>

              <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-4">
                <div className="text-[11px] font-semibold tracking-[0.24em] text-cyan-100 uppercase">Donation support</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Donations fund a shared credit pool. Requests are reviewed manually first, then approved credits are fulfilled from that pool so support stays moderated instead of becoming a giveaway faucet.
                </p>
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
              Open the jobs board, check the fit, and only then move into the output tools that cost credits.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={primaryHref} className="shell-primary-btn">
                {primaryLabel}
              </Link>
              <Link href="/account" className="shell-secondary-btn">
                Open account hub
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
