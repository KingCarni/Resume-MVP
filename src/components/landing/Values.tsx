// src/components/landing/Values.tsx
export default function Values() {
  const values = [
    {
      title: "Truth over hype",
      desc: "The goal is stronger positioning — not fake experience, inflated claims, or garbage keyword stuffing.",
    },
    {
      title: "Affordable by design",
      desc: "Career tools shouldn’t require another recurring bill just to keep applying for jobs.",
    },
    {
      title: "Built to be useful",
      desc: "You stay in control: analyze, rewrite, preview, edit, and export without getting boxed in.",
    },
  ];

  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="text-xs font-black uppercase tracking-widest text-black/90">
        Values
      </div>
      <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">
        A career tool that actually respects the user.
      </h2>
      <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-black/85">
        Git-a-Job is built around practical help: stronger applications, transparent pricing,
        and tools that support the applicant instead of trapping them.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {values.map((v) => (
          <div
            key={v.title}
            className="rounded-3xl border border-white/35 bg-white/30 p-5"
          >
            <div className="text-base font-black text-black">{v.title}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-black/90">
              {v.desc}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}