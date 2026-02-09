// src/app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
        Resume Tools MVP
      </h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Choose a tool:
      </p>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/resume"
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 900,
            color: "inherit",
          }}
        >
          Resume Compiler
        </Link>

        <Link
          href="/cover-letter"
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 900,
            color: "inherit",
          }}
        >
          Cover Letter Generator
        </Link>
      </div>

      <div style={{ marginTop: 18, opacity: 0.75 }}>
        Tip: Bookmark <strong>/resume</strong> or <strong>/cover-letter</strong>.
      </div>
    </main>
  );
}
