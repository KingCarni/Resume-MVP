// src/components/landing/DonateCreditsTeaser.tsx
import Link from "next/link";

export default function DonateCreditsTeaser() {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-widest text-black/60">
            Coming soon
          </div>
          <h2 className="mt-2 text-2xl font-black text-black">Donate Credits</h2>
          <p className="mt-3 text-sm font-semibold text-black/70">
            Eventually, you’ll be able to donate unused <span className="font-black">paid</span> credits.
            Free users can request help and receive a small portion from the community.
            Think of it like an open gift card — job seekers helping job seekers.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/toolbelt"
            className="rounded-xl bg-black px-4 py-2 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
          >
            Open Toolbelt
          </Link>
        </div>
      </div>
    </section>
  );
}