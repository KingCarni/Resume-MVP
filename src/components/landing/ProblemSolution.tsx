// src/components/landing/ProblemSolution.tsx
export default function ProblemSolution() {
  const problems = [
    "Most resumes read like task lists instead of impact.",
    "ATS keyword gaps are easy to miss until it’s too late.",
    "Cover letters often sound stiff, generic, or fake.",
    "Most “premium” career tools push expensive subscriptions.",
  ];

  const solutions = [
    "Analyze resume fit against the target role and expose missing keyword coverage.",
    "Rewrite bullets toward stronger verbs, clearer outcomes, and better alignment.",
    "Generate editable cover letters that feel usable instead of robotic.",
    "Keep pricing transparent with credits instead of locking people into a monthly plan.",
  ];

  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-8 lg:p-10">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-black/90">
            The problem
          </div>

          <h2 className="mt-3 text-2xl font-black leading-[1.08] tracking-tight text-black sm:text-3xl lg:text-[3rem]">
            <span className="block">Applying is hard.</span>
            <span className="block">Your tools shouldn&apos;t</span>
            <span className="block">make it worse.</span>
          </h2>

          <ul className="mt-6 space-y-3">
            {problems.map((p) => (
              <li
                key={p}
                className="rounded-2xl border border-white/35 bg-white/30 p-4 text-sm font-semibold leading-6 text-black/90"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-black uppercase tracking-widest text-black/90">
            The fix
          </div>

          <h2 className="mt-3 text-2xl font-black leading-[1.08] tracking-tight text-black sm:text-3xl lg:text-[3rem]">
            <span className="block">Clearer applications.</span>
            <span className="block">Better signal.</span>
            <span className="block">Less fluff.</span>
          </h2>

          <ul className="mt-6 space-y-3">
            {solutions.map((s) => (
              <li
                key={s}
                className="rounded-2xl border border-white/35 bg-white/30 p-4 text-sm font-semibold leading-6 text-black/90"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
