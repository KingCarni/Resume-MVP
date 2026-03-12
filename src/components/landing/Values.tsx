// src/components/landing/Values.tsx
export default function Values() {
  const values = [
    {
      title: "Opportunity shouldn’t be gated by price",
      desc: "Career tools shouldn’t require another expensive subscription.",
    },
    {
      title: "Confidence comes from clarity",
      desc: "When your story is structured and impact-driven, applying feels easier.",
    },
    {
      title: "Built to help, not to trap",
      desc: "Transparent credits, clear outcomes, and room to edit the results.",
    },
  ];

  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="text-xs font-black uppercase tracking-widest text-black/90">
        Values
      </div>
      <h2 className="mt-2 text-2xl font-black text-black">
        A tool that respects people.
      </h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {values.map((v) => (
          <div key={v.title} className="rounded-3xl border border-white/35 bg-white/30 p-5">
            <div className="text-base font-black text-black">{v.title}</div>
            <div className="mt-2 text-sm font-semibold text-black/90">{v.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}