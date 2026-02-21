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
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-black tracking-tight text-black sm:text-5xl">
          Land better roles — without paying monthly subscription fees.
        </h1>

        <p className="mt-4 text-base font-semibold text-black/75">
          Git-a-Job helps you turn messy resumes into clear, impactful tools. It can also generate cover letters
          that match the role. Built to be affordable, transparent, and actually useful.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-white/40 bg-white/25 px-3 py-2 text-xs font-extrabold text-black/70 shadow-sm backdrop-blur">
            {props.perkLine || "Start free. Upgrade only if you want."}
          </div>

          <div className="text-xs font-extrabold text-black/55">
            No subscription traps. Credits are clear and optional.
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={props.primaryHref}
            className="rounded-xl bg-black px-6 py-3 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
          >
            {props.primaryLabel}
          </Link>

          {/* ✅ normal anchor for hash navigation */}
          <a
            href={props.secondaryHref || "#how-it-works"}
            className="rounded-xl border border-white/40 bg-white/25 px-6 py-3 text-sm font-extrabold text-black shadow-sm backdrop-blur hover:bg-white/35"
          >
            {props.secondaryLabel}
          </a>
        </div>
      </div>
    </section>
  );
}