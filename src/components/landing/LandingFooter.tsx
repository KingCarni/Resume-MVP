import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="shell-panel px-6 py-8 sm:px-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <div className="font-[var(--font-display)] text-lg font-bold tracking-[0.2em] text-white uppercase">
            Git-a-Job
          </div>
          <p className="mt-3 max-w-lg text-sm leading-7 text-slate-300">
            Match against real jobs, see your fit clearly, and tailor faster with real context.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Workflow</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div><Link href="/jobs" className="transition hover:text-cyan-200">Job match</Link></div>
              <div><Link href="/resume" className="transition hover:text-cyan-200">Resume compiler</Link></div>
              <div><Link href="/cover-letter" className="transition hover:text-cyan-200">Cover letter</Link></div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Account</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div><Link href="/account" className="transition hover:text-cyan-200">Profile hub</Link></div>
              <div><Link href="/buy-credits" className="transition hover:text-cyan-200">Buy credits</Link></div>
              <div><a href="https://git-a-job.com/donate" className="transition hover:text-cyan-200">Donate</a></div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase">Product</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div><Link href="/feedback" className="transition hover:text-cyan-200">Feedback</Link></div>
              <div className="text-slate-500">Built for tech and game hiring.</div>
              <div className="text-slate-500">© {new Date().getFullYear()} Git-a-Job</div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
