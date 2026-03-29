// src/components/landing/FinalCTA.tsx
import Link from "next/link";

export default function FinalCTA(props: { primaryHref: string; primaryLabel: string }) {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-8 lg:p-10">
      <div className="max-w-3xl">
        <div className="text-xs font-black uppercase tracking-widest text-black/90">
          Ready?
        </div>

        <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">
          Stop guessing. Start shipping stronger applications.
        </h2>

        <p className="mt-3 text-sm font-semibold leading-6 text-black/90">
          Analyze your resume, improve the weak spots, generate a cleaner cover letter,
          preview the result, and apply with more confidence.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={props.primaryHref}
            className="inline-block rounded-xl bg-black px-6 py-3 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
          >
            {props.primaryLabel}
          </Link>

          <a
            href="#how-it-works"
            className="inline-block rounded-xl border border-white/40 bg-white/25 px-6 py-3 text-sm font-extrabold text-black shadow-sm backdrop-blur transition-all duration-200 hover:bg-white/35 hover:scale-[1.02]"
          >
            Review the flow
          </a>
        </div>
      </div>
    </section>
  );
}
