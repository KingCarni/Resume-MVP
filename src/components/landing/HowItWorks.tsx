// src/components/landing/HowItWorks.tsx
export default function HowItWorks({ id }: { id?: string }) {
  const steps = [
    { n: "01", t: "Add your resume", d: "Upload PDF/DOCX or paste your text." },
    { n: "02", t: "Paste the job post", d: "Give the tool the target role context." },
    { n: "03", t: "Generate + refine", d: "Get a draft, then edit with live preview." },
    { n: "04", t: "Export + apply", d: "Download a clean PDF and start applying." },
  ];

  return (
    <section id={id} className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="text-xs font-black uppercase tracking-widest text-black/60">
        How it works
      </div>
      <h2 className="mt-2 text-2xl font-black text-black">Simple flow. Real output.</h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.n} className="rounded-3xl border border-white/35 bg-white/30 p-5">
            <div className="text-xs font-black text-black/60">{s.n}</div>
            <div className="mt-1 text-base font-black text-black">{s.t}</div>
            <div className="mt-2 text-sm font-semibold text-black/70">{s.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}