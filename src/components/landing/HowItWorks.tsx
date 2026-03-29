// src/components/landing/HowItWorks.tsx
export default function HowItWorks({ id }: { id?: string }) {
  const steps = [
    {
      n: "01",
      t: "Add your resume",
      d: "Upload a DOC or DOCX, or paste your resume text directly into the tool. PDFs still work too, but Word files usually give the cleanest results.",
    },
    {
      n: "02",
      t: "Paste the job posting",
      d: "Give Git-a-Job the target role so it can analyze alignment and identify gaps.",
    },
    {
      n: "03",
      t: "Analyze + improve",
      d: "Review ATS keyword coverage, strengthen bullets, and generate a role-aligned cover letter.",
    },
    {
      n: "04",
      t: "Preview + export",
      d: "Check the final result in preview, refine it if needed, then export and apply.",
    },
  ];

  return (
    <section
      id={id}
      className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-8 lg:p-10"
    >
      <div className="text-xs font-black uppercase tracking-widest text-black/90">
        How it works
      </div>

      <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">
        Simple flow. Real output. No fluff.
      </h2>

      <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-black/85">
        The goal is not to drown you in “AI magic.” It’s to help you make the next best edit,
        faster, and get to a stronger final application.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <div
            key={s.n}
            className="rounded-3xl border border-white/35 bg-white/30 p-5"
          >
            <div className="text-xs font-black text-black/90">{s.n}</div>
            <div className="mt-1 text-base font-black text-black">{s.t}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-black/90">
              {s.d}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
