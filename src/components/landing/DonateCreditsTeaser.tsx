// src/components/landing/DonateCreditsTeaser.tsx

export default function DonateCreditsTeaser() {
  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="max-w-3xl">
        <div className="text-xs font-black uppercase tracking-widest text-black/60">
          Coming soon
        </div>

        <h2 className="mt-2 text-2xl font-black text-black">
          Donate Credits
        </h2>

        <p className="mt-3 text-sm font-semibold text-black/70">
          Soon you’ll be able to donate unused <span className="font-black">paid</span> credits.
          Free users can request help and receive a small portion from the community.
          Think of it like an open gift card — job seekers helping job seekers.
        </p>

        <p className="mt-3 text-xs font-extrabold text-black/55">
          (Planned feature: daily login bonus — awarded once per calendar day.)
        </p>
      </div>
    </section>
  );
}