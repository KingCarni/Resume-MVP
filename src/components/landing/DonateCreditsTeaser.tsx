// src/components/landing/DonateCreditsTeaser.tsx
"use client";

import Link from "next/link";

export default function DonateCreditsTeaser() {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-8 lg:p-10">
      <div className="max-w-4xl">
        <div className="text-xs font-black uppercase tracking-widest text-black/90">
          Support Git-a-Job
        </div>

        <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">
          Help another job seeker get unstuck.
        </h2>

        <p className="mt-3 text-sm font-semibold leading-6 text-black/90">
          If the platform helps you, you can help keep it useful for someone else too.
          Git-a-Job supports both community credit donations and direct support for continued development.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/35 bg-white/30 p-5">
            <div className="text-base font-black text-black">🎟 Donate Credits</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-black/90">
              Contribute paid credits to the community pool for applicants who request help.
            </p>
          </div>

          <div className="rounded-3xl border border-white/35 bg-white/30 p-5">
            <div className="text-base font-black text-black">💳 Donate Money</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-black/90">
              Help cover development, hosting, OCR, and continued improvements to the platform.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/account/donate"
            className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-800 hover:shadow-lg"
          >
            Donate Credits
          </Link>

          <Link
            href="/account"
            className="rounded-xl border border-white/40 bg-white/25 px-5 py-3 text-sm font-black text-black shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-white/35 hover:shadow-lg"
          >
            Ask for Donation
          </Link>

          <Link
            href="/donate"
            className="rounded-xl bg-black px-5 py-3 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
          >
            Donate Money
          </Link>
        </div>

        <p className="mt-6 text-xs font-extrabold leading-5 text-black/90">
          “Ask for Donation” is for credit help from the community pool and takes users to the Account page to request help. Credits donated come from paid credit purchases only, and requests are manually reviewed before fulfillment.
        </p>
      </div>
    </section>
  );
}
