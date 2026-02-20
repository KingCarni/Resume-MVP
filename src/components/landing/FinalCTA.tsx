// src/components/landing/FinalCTA.tsx
import Link from "next/link";

export default function FinalCTA(props: { primaryHref: string; primaryLabel: string }) {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <h2 className="text-2xl font-black text-black sm:text-3xl">
        Ready to apply with confidence?
      </h2>
      <p className="mt-3 text-sm font-semibold text-black/70">
        No fluff. No subscription traps. Just tools that help you ship applications.
      </p>

      <div className="mt-6">
        <Link
          href={props.primaryHref}
          className="inline-block rounded-xl bg-black px-6 py-3 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
        >
          {props.primaryLabel}
        </Link>
      </div>
    </section>
  );
}