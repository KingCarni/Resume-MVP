// src/components/landing/FeatureGrid.tsx
export default function FeatureGrid() {
  const features = [
    {
      title: "Resume Builder",
      desc: "Turn experience into stronger bullets with clearer verbs, structure, and impact.",
    },
    {
      title: "Cover Letter Generator",
      desc: "Role-aligned cover letters that don’t sound robotic — and stay editable.",
    },
    {
      title: "Template Preview + PDF",
      desc: "See the final result before you export. Keep formatting consistent.",
    },
    {
      title: "Credit-Based Pricing",
      desc: "Pay for usage, not a monthly trap. Clear cost per action.",
    },
  ];

  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-black/60">
            What it does
          </div>
          <h2 className="mt-2 text-2xl font-black text-black">
            Tools that help you apply with confidence.
          </h2>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-3xl border border-white/35 bg-white/30 p-5 shadow-sm"
          >
            <div className="text-base font-black text-black">{f.title}</div>
            <div className="mt-2 text-sm font-semibold text-black/70">{f.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}