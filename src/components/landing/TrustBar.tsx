// src/components/landing/TrustBar.tsx
export default function TrustBar() {
  const items = [
    "Built for Tech + Gaming applicants",
    "Upload PDF/DOCX or paste text",
    "Template preview + PDF export",
    "New users start with 25 free credits",
  ];

  return (
    <section className="rounded-3xl border border-white/30 bg-white/25 p-4 shadow-sm backdrop-blur-xl">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((t) => (
          <div
            key={t}
            className="rounded-2xl border border-white/35 bg-white/35 px-4 py-3 text-sm font-extrabold text-black/90"
          >
            {t}
          </div>
        ))}
      </div>
    </section>
  );
}