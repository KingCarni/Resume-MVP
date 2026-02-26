// src/components/landing/ProblemSolution.tsx
export default function ProblemSolution() {
  const problems = [
    "Most resumes read like task lists, not impact.",
    "Cover letters feel awkward and generic.",
    "“Premium” tools are expensive and push subscriptions.",
    "It’s hard to know what to improve first.",
  ];

  const solutions = [
    "Rewrite bullets into clear outcomes and measurable impact.",
    "Generate role-aligned cover letters you can actually edit.",
    "Keep pricing transparent with credits (and a free path).",
    "Make the next best edit obvious: clarity, verbs, structure.",
  ];

  return (
    <section className="rounded-3xl border border-white/30 bg-white/35 p-6 shadow-xl backdrop-blur-xl sm:p-10">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-black/60">
            The problem
          </div>
          <h2 className="mt-2 text-2xl font-black text-black">
            Applying is hard — and it’s easy to get stuck.
          </h2>
          <ul className="mt-4 space-y-2">
            {problems.map((p) => (
              <li
                key={p}
                className="rounded-2xl border border-white/35 bg-white/30 p-3 text-sm font-semibold text-black/75"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-black uppercase tracking-widest text-black/60">
            The fix
          </div>
          <h2 className="mt-2 text-2xl font-black text-black">
            
 focuses on outcomes, not fluff.
          </h2>
          <ul className="mt-4 space-y-2">
            {solutions.map((s) => (
              <li
                key={s}
                className="rounded-2xl border border-white/35 bg-white/30 p-3 text-sm font-semibold text-black/75"
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