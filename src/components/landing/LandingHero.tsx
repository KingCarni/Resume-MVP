// src/components/landing/LandingHero.tsx
import Link from "next/link";

export default function LandingHero(props: {
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string; // e.g. "#how-it-works"
  secondaryLabel: string;
  perkLine?: string;
}) {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-8 lg:p-10">
      <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div className="max-w-3xl">
          <div className="inline-flex rounded-full border border-white/40 bg-white/30 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-black/90 shadow-sm backdrop-blur">
            ATS-aware resume + cover letter tools
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight text-black sm:text-5xl lg:text-6xl">
            Tailor stronger applications — without another monthly subscription.
          </h1>

          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-black/90 sm:text-lg">
            Git-a-Job helps tech and gaming applicants improve resume bullets,
            increase ATS keyword alignment, generate cleaner cover letters, and
            preview everything before export — all with transparent credit-based
            pricing.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/40 bg-white/25 px-3 py-2 text-xs font-extrabold text-black/90 shadow-sm backdrop-blur">
              {props.perkLine || "New accounts start with 25 free credits. Earn 10 bonus credits every day you sign in."}
            </div>

            <div className="rounded-xl border border-white/35 bg-white/20 px-3 py-2 text-xs font-extrabold text-black/90 shadow-sm backdrop-blur">
              No subscription traps. Pay for actual usage. Donate leftover credits to help another job seeker.
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={props.primaryHref}
              className="rounded-xl bg-black px-6 py-3 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
            >
              {props.primaryLabel}
            </Link>

            <a
              href={props.secondaryHref || "#how-it-works"}
              className="rounded-xl border border-white/40 bg-white/25 px-6 py-3 text-sm font-extrabold text-black shadow-sm backdrop-blur transition-all duration-200 hover:bg-white/35 hover:scale-[1.02]"
            >
              {props.secondaryLabel}
            </a>
          </div>
        </div>

        <div className="rounded-3xl border border-white/35 bg-white/30 p-5 shadow-sm backdrop-blur">
          <div className="text-xs font-black uppercase tracking-widest text-black/90">
            Built for real applicants
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/35 bg-white/35 p-4">
              <div className="text-sm font-black text-black">Resume analysis</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-black/80">
                See ATS alignment, keyword gaps, and where your resume needs work first.
              </div>
            </div>

            <div className="rounded-2xl border border-white/35 bg-white/35 p-4">
              <div className="text-sm font-black text-black">Safer rewrites</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-black/80">
                Improve wording and clarity without inventing experience or stuffing nonsense.
              </div>
            </div>

            <div className="rounded-2xl border border-white/35 bg-white/35 p-4">
              <div className="text-sm font-black text-black">Preview before export</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-black/80">
                See the result, refine it, then export cleanly instead of guessing.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
