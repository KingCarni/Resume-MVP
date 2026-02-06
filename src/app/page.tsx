"use client";

import { useMemo, useState } from "react";

const MIN_RESUME_CHARS = 800;      // tweak as needed
const MIN_JOB_CHARS = 600;

function countChars(s: string) {
  return s.replace(/\s+/g, " ").trim().length;
}

export default function ResumePasteMVP() {
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);



  const resumeChars = useMemo(() => countChars(resumeText), [resumeText]);
  const jobChars = useMemo(() => countChars(jobText), [jobText]);

  const canSubmit =
    resumeChars >= MIN_RESUME_CHARS && jobChars >= MIN_JOB_CHARS && !submitting;

 async function onSubmit() {
  setError(null);
  setResult(null);
  setSubmitting(true);

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeText,
        jobText,
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Request failed");
    }

    const data = await res.json();
    setResult(data);
  } catch (e: any) {
    setError(e?.message || "Something went wrong");
  } finally {
    setSubmitting(false);
  }
}


  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>
        Tailor your resume to a job posting
      </h1>
      <p style={{ marginBottom: 16 }}>
        Paste your resume and the job posting. We’ll analyze fit and rewrite key
        bullets. <b>Don’t paste sensitive info</b> (SIN, full address, etc.).
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <section>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Resume text</h2>
            <span style={{ opacity: 0.8 }}>
              {resumeChars} chars • min {MIN_RESUME_CHARS}
            </span>
          </div>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here..."
            rows={12}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ccc",
              fontFamily: "inherit",
            }}
          />
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setResumeText("")}
              style={{ padding: "8px 12px" }}
            >
              Clear
            </button>
            {resumeChars > 0 && resumeChars < MIN_RESUME_CHARS && (
              <span style={{ color: "#b45309", alignSelf: "center" }}>
                Add more content so the rewrite is accurate.
              </span>
            )}
          </div>
        </section>

        <section>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Job posting</h2>
            <span style={{ opacity: 0.8 }}>
              {jobChars} chars • min {MIN_JOB_CHARS}
            </span>
          </div>
          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="Paste the job description here..."
            rows={10}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ccc",
              fontFamily: "inherit",
            }}
          />
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setJobText("")}
              style={{ padding: "8px 12px" }}
            >
              Clear
            </button>
            {jobChars > 0 && jobChars < MIN_JOB_CHARS && (
              <span style={{ color: "#b45309", alignSelf: "center" }}>
                Add more of the posting for better matching.
              </span>
            )}
          </div>
        </section>

        {error && (
          <div style={{ padding: 12, borderRadius: 10, border: "1px solid #fca5a5", color: "#991b1b" }}>
            {error}
          </div>
        )}
{result?.ok && (
  <div
    style={{
      padding: 16,
      borderRadius: 12,
      border: "1px solid #ddd",
      background: "#fafafa",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Keyword Fit</h2>
      <div style={{ fontSize: 22, fontWeight: 700 }}>
        {result.matchScore}% match
      </div>
    </div>

    {Array.isArray(result.highImpactMissing) && result.highImpactMissing.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>High-impact missing</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {result.highImpactMissing.map((k: string) => (
            <span
              key={k}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #fca5a5",
                background: "#fee2e2",
                color: "#991b1b",
                fontSize: 13,
              }}
            >
              {k}
            </span>
          ))}
        </div>
      </div>
    )}

    {Array.isArray(result.keywordsFoundInResume) && result.keywordsFoundInResume.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Found in resume</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {result.keywordsFoundInResume.slice(0, 30).map((k: string) => (
            <span
              key={k}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #86efac",
                background: "#dcfce7",
                color: "#166534",
                fontSize: 13,
              }}
            >
              {k}
            </span>
          ))}
        </div>
      </div>
    )}

    {Array.isArray(result.missingKeywords) && result.missingKeywords.length > 0 && (
      <div style={{ marginTop: 12, opacity: 0.9 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          Missing (full list)
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          {result.missingKeywords.join(", ")}
        </div>
      </div>
    )}
  </div>
)}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {submitting ? "Analyzing..." : "Analyze & Rewrite"}
        </button>
      </div>
    </div>
  );
}
