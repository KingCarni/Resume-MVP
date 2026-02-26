// src/components/landing/DonateCreditsTeaser.tsx
"use client";

import Link from "next/link";

export default function DonateCreditsTeaser() {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="max-w-3xl">
        <div className="text-xs font-black uppercase tracking-widest text-black/60">
          Support Git-a-Job
        </div>

        <h2 className="mt-2 text-2xl font-black text-black">
          Help other job seekers succeed
        </h2>

        <p className="mt-3 text-sm font-semibold text-black/70">
          You can support the platform in two ways:
        </p>

        <ul className="mt-4 space-y-2 text-sm font-semibold text-black/75">
          <li>
            🎟 <span className="font-black">Donate Credits</span> — Contribute
            paid credits to the community pool for job seekers who request help.
          </li>
          <li>
            💳 <span className="font-black">Donate Money</span> — Support
            continued development and hosting costs.
          </li>
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/account/donate"
            className="rounded-xl bg-emerald-700 px-5 py-2 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-800 hover:shadow-lg"
          >
            Donate Credits
          </Link>

          <Link
            href="/donate"
            className="rounded-xl border border-black/20 bg-black px-5 py-2 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
          >
            Donate Money
          </Link>
        </div>

        <p className="mt-6 text-xs font-extrabold text-black/55">
          Credits donated come from paid credit purchases only.
          Requests are manually reviewed before fulfillment.
        </p>
      </div>
    </section>
  );
}