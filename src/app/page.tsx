"use client";

import { useMemo, useState } from "react";

const MIN_RESUME_CHARS = 800; // tweak as needed
const MIN_JOB_CHARS = 600;

function countChars(s: string) {
  return s.replace(/\s+/g, " ").trim().length;
}

const styles = {
  page: {
    maxWidth: 900,
    margin: "40px auto",
    padding: 16,
    color: "#0f172a",
  } as const,
  header: { fontSize: 28, marginBottom: 8 } as const,
  subtext: { marginBottom: 16, color: "#334155" } as const,

  sectionTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  } as const,
  h2: { fontSize: 18, marginBottom: 6 } as const,
  counter: { opacity: 0.85, color: "#334155" } as const,

  textarea: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    fontFamily: "inherit",
    color: "#0f172a",
    background: "#ffffff",
  } as const,

  helperRow: { marginTop: 8, display: "flex", gap: 8 } as const,
  warn: { color: "#b45309", alignSelf: "center" } as const,

  error: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid #ef4444",
    background: "#fee2e2",
    color: "#7f1d1d",
  } as const,

  resultsCard: {
    padding: 16,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
  } as const,

  resultsHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  } as const,

  resultsTitle: { margin: 0, fontSize: 18, fontWeight: 800 } as const,
  score: { fontSize: 22, fontWeight: 800 } as const,

  barOuter: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
  } as const,

  barInner: (pct: number) =>
    ({
      height: "100%",
      width: `${Math.max(0, Math.min(100, pct))}%`,
      background: "#0f172a",
    }) as const,

  barHint: { marginTop: 6, fontSize: 12, color: "#334155" } as const,

  sectionLabel: { fontWeight: 700, marginBottom: 6, color: "#0f172a" } as const,
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8 } as const,

  chipRed: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #ef4444",
    background: "#fee2e2",
    color: "#7f1d1d",
    fontSize: 13,
    fontWeight: 600,
  } as const,

  chipGreen: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #22c55e",
    background: "#dcfce7",
    color: "#14532d",
    fontSize: 13,
    fontWeight: 600,
  } as const,

  chipNeutral: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 600,
  } as const,

  missingList: { fontSize: 13, lineHeight: 1.5, color: "#0f172a" } as const,

  button: (enabled: boolean) =>
    ({
      padding: "12px 16px",
      borderRadius: 12,
      border: "1px solid #0f172a",
      background: enabled ? "#0f172a" : "#334155",
      color: "#ffffff",
      cursor: enabled ? "pointer" : "not-allowed",
      opacity: enabled ? 1 : 0.55,
      fontWeight: 800,
      letterSpacing: 0.2,
    }) as const,

  clearBtn: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
  } as const,
};

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
    <div style={styles.page}>
      <h1 style={styles.header}>Tailor your resume to a job posting</h1>
      <p style={styles.subtext}>
        Paste your resume and the job posting. We’ll analyze fit and rewrite key
        bullets. <b>Don’t paste sensitive info</b> (SIN, full address, etc.).
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <section>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.h2}>Resume text</h2>
            <span style={styles.counter}>
              {resumeChars} chars • min {MIN_RESUME_CHARS}
            </span>
          </div>

          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here..."
            rows={12}
            style={styles.textarea}
          />

          <div style={styles.helperRow}>
            <button
              type="button"
              onClick={() => setResumeText("")}
              style={styles.clearBtn}
            >
              Clear
            </button>

            {resumeChars > 0 && resumeChars < MIN_RESUME_CHARS && (
              <span style={styles.warn}>
                Add more content so the rewrite is accurate.
              </span>
            )}
          </div>
        </section>

        <section>
          <div style={styles.sectionTitleRow}>
            <h2 style={styles.h2}>Job posting</h2>
            <span style={styles.counter}>
              {jobChars} chars • min {MIN_JOB_CHARS}
            </span>
          </div>

          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="Paste the job description here..."
            rows={10}
            style={styles.textarea}
          />

          <div style={styles.helperRow}>
            <button
              type="button"
              onClick={() => setJobText("")}
              style={styles.clearBtn}
            >
              Clear
            </button>

            {jobChars > 0 && jobChars < MIN_JOB_CHARS && (
              <span style={styles.warn}>
                Add more of the posting for better matching.
              </span>
            )}
          </div>
        </section>

        {error && <div style={styles.error}>{error}</div>}

        {result?.ok && (
          <div style={styles.resultsCard}>
            <div style={styles.resultsHeaderRow}>
              <h2 style={styles.resultsTitle}>Keyword Fit</h2>
              <div style={styles.score}>{result.matchScore}% match</div>
            </div>

            <div style={styles.barOuter}>
              <div style={styles.barInner(Number(result.matchScore) || 0)} />
            </div>
            <div style={styles.barHint}>
              Higher is better. Aim for ~70%+ if you’re targeting a tight match.
            </div>

            {result?.ok && (
  <div style={styles.resultsCard}>
    {/* ...existing sections... */}

    {/* ✅ Add this section */}
    {Array.isArray(result.rewritePlan) && result.rewritePlan.length > 0 && (
      <div style={{ marginTop: 14 }}>
        <div style={styles.sectionLabel}>Rewrite plan (top 5)</div>

        <div style={{ display: "grid", gap: 10 }}>
          {result.rewritePlan.slice(0, 5).map((item: any) => (
            <div
              key={item.bulletId}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
              }}
            >
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
                Bullet {item.bulletId}
              </div>

              <div style={{ fontWeight: 800, marginBottom: 8, color: "#0f172a" }}>
                {item.original}
              </div>

              {Array.isArray(item.targetKeywords) && item.targetKeywords.length > 0 && (
                <div style={styles.chipRow}>
                  {item.targetKeywords.map((kw: string) => (
                    <span key={kw} style={styles.chipNeutral}>
                      + {kw}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "#0f172a" }}>
                {item.suggestionText}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* ...existing sections... */}
  </div>
)}



            {Array.isArray(result.highImpactMissing) &&
              result.highImpactMissing.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.sectionLabel}>High-impact missing</div>
                  <div style={styles.chipRow}>
                    {result.highImpactMissing.map((k: string) => (
                      <span key={k} style={styles.chipRed}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              

            {Array.isArray(result.keywordsFoundInResume) &&
              result.keywordsFoundInResume.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.sectionLabel}>Found in resume</div>
                  <div style={styles.chipRow}>
                    {result.keywordsFoundInResume.slice(0, 30).map((k: string) => (
                      <span key={k} style={styles.chipGreen}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {Array.isArray(result.bullets) && result.bullets.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={styles.sectionLabel}>Resume bullets detected</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {result.bullets.slice(0, 10).map((b: any) => (
                    <div
                      key={b.id ?? b.text}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        {b.text}
                      </div>

                      {Array.isArray(result.bulletSuggestions) && (
                        (() => {
                          const s = result.bulletSuggestions.find(
                            (x: any) => x.bulletId === b.id
                          );
                          const kws: string[] = Array.isArray(s?.suggestedKeywords)
                            ? s.suggestedKeywords
                            : [];
                          return kws.length ? (
                            <div style={styles.chipRow}>
                              {kws.map((kw) => (
                                <span key={kw} style={styles.chipNeutral}>
                                  + {kw}
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(result.missingKeywords) &&
              result.missingKeywords.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.sectionLabel}>Missing (full list)</div>
                  <div style={styles.missingList}>
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
          style={styles.button(canSubmit)}
        >
          {submitting ? "Analyzing..." : "Analyze & Rewrite"}
        </button>
      </div>
    </div>
  );
}
