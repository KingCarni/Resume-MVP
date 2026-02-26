// src/components/landing/DonateCreditsTeaser.tsx
"use client";

import Link from "next/link";

export default function DonateCreditsTeaser() {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="max-w-3xl">
        <div className="text-xs font-black uppercase tracking-widest text-black/60">
          Now available
        </div>

        <h2 className="mt-2 text-2xl font-black text-black">Donate Credits</h2>

        <p className="mt-3 text-sm font-semibold text-black/70">
          Help job seekers by donating{" "}
          <span className="font-black">paid</span> credits to the community pool.
          Requests are reviewed by an admin before credits are granted.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/account/donate"
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-800 hover:shadow-lg"
          >
            Donate credits
          </Link>

          <Link
            href="/account"
            className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-black text-black shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-black/5"
          >
            Request help
          </Link>

          <div className="text-xs font-extrabold text-black/55">
            Paid credits only • Requests are manually verified
          </div>
        </div>

        <p className="mt-4 text-xs font-extrabold text-black/55">
          Note: Free credits (signup bonus + daily bonus) can’t be donated.
        </p>
      </div>
    </section>
  );
}