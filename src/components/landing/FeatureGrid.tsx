// src/components/landing/FeatureGrid.tsx
export default function FeatureGrid() {
  const features = [
    {
      title: "Resume Analyzer",
      desc: "Check ATS alignment, keyword coverage, and which parts of your resume need the most work first.",
    },
    {
      title: "Bullet Rewriter",
      desc: "Strengthen weak bullets with clearer verbs, stronger structure, and better role alignment — while staying grounded in the original experience.",
    },
    {
      title: "Cover Letter Generator",
      desc: "Generate role-aligned cover letters that stay editable and don’t read like obvious AI filler.",
    },
    {
      title: "Preview + PDF Export",
      desc: "See the finished result before you commit. Adjust templates, review output, then export cleanly.",
    },
    {
      title: "Credit-Based Pricing",
      desc: "Use what you need. No bloated monthly plan. Costs stay visible and predictable.",
    },
    {
      title: "Built for Real Use",
      desc: "Designed for tech and gaming applicants who want stronger applications fast — not another overhyped career subscription.",
    },
  ];

  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div>
        <div className="text-xs font-black uppercase tracking-widest text-black/90">
          What it does
        </div>
        <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">
          Everything you need to improve the application — not just “make it prettier.”
        </h2>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-black/85">
          Git-a-Job focuses on stronger content, better alignment, and cleaner output —
          so you can stop guessing what to fix and start shipping better applications.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-3xl border border-white/35 bg-white/30 p-5 shadow-sm"
          >
            <div className="text-base font-black text-black">{f.title}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-black/90">
              {f.desc}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}