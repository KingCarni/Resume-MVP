"use client";

import { useMemo, useState } from "react";

type RewritePlanItem = {
  originalBullet?: any; // can be string OR {id,text}
  suggestedKeywords?: any;
  reason?: any;
  rewrittenBullet?: any;
};

type AnalyzeResponse = {
  ok: boolean;
  error?: string;

  matchScore?: number;
  missingKeywords?: string[];
  matchedKeywords?: string[];

  bullets?: any[]; // can be string[] OR object[]
  weakBullets?: any;
  bulletSuggestions?: any;
  rewritePlan?: RewritePlanItem[];

  debug?: any;
};

async function parseApiResponse(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

function isHtmlDoc(x: unknown) {
  return (
    typeof x === "string" &&
    (x.includes("<!DOCTYPE html>") || x.includes('id="__NEXT_DATA__"'))
  );
}

/** Safely turns bullets or bullet-like objects into displayable text */
function bulletToText(b: any): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object") {
    // common shapes: {id,text}, {text}, {value}
    const v = b.text ?? b.value ?? b.bullet ?? b.originalBullet;
    if (typeof v === "string") return v;
    return String(v ?? "");
  }
  return String(b ?? "");
}

/** Safely gets the original bullet text from a rewrite plan item */
function planItemToText(item: any): string {
  if (!item) return "";
  const raw = item.originalBullet ?? item.bullet ?? item.original ?? item.text ?? item;
  return bulletToText(raw).trim();
}

/** Safely get suggested keywords as string[] */
function keywordsToArray(k: any): string[] {
  if (Array.isArray(k)) return k.map((x) => String(x)).filter(Boolean);
  if (typeof k === "string") {
    // allow comma separated strings
    return k.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (k && typeof k === "object" && Array.isArray(k.keywords)) {
    return k.keywords.map((x: any) => String(x)).filter(Boolean);
  }
  return [];
}

export default function Page() {
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingRewriteIndex, setLoadingRewriteIndex] = useState<number | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const canAnalyze = useMemo(() => {
    const hasResume = !!file || resumeText.trim().length > 0;
    const hasJob = jobText.trim().length > 0;
    return hasResume && hasJob;
  }, [file, resumeText, jobText]);

  async function handleAnalyze() {
    setLoadingAnalyze(true);
    setError(null);
    setAnalysis(null);

    try {
      let res: Response;

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("jobText", jobText);

        if (resumeText.trim()) fd.append("resumeText", resumeText.trim());

        res = await fetch("/api/analyze", {
          method: "POST",
          body: fd, // no headers
        });
      } else {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText, jobText }),
        });
      }

      const payload = await parseApiResponse(res);

      if (isHtmlDoc(payload)) {
        throw new Error(
          `Analyze returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`
        );
      }

      if (!res.ok) {
        throw new Error(
          typeof payload === "string"
            ? payload
            : payload?.error || "Analyze failed"
        );
      }

      if (typeof payload === "string") {
        throw new Error("Analyze returned unexpected non-JSON response.");
      }

      setAnalysis(payload);
    } catch (e: any) {
      setError(e?.message || "Analyze failed");
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function handleRewriteBullet(index: number) {
    if (!analysis?.rewritePlan || !analysis.rewritePlan[index]) return;

    setLoadingRewriteIndex(index);
    setError(null);

    try {
      const item = analysis.rewritePlan[index];

      const originalBullet = planItemToText(item);
      const suggestedKeywords = keywordsToArray(item?.suggestedKeywords);

      if (!originalBullet) throw new Error("Missing original bullet");

      const res = await fetch("/api/rewrite-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalBullet,
          suggestedKeywords,
          jobText,
          role: "QA Lead",
          tone: "confident, concise, impact-driven",
        }),
      });

      const payload = await parseApiResponse(res);

      if (isHtmlDoc(payload)) {
        throw new Error(
          `Rewrite returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`
        );
      }

      if (!res.ok) {
        throw new Error(
          typeof payload === "string"
            ? payload
            : payload?.error || "Rewrite failed"
        );
      }

      if (typeof payload === "string") {
        throw new Error("Rewrite returned unexpected non-JSON response.");
      }

      const rewrittenBullet = String(payload?.rewrittenBullet ?? "").trim();
      if (!rewrittenBullet) throw new Error("AI returned empty rewrite");

      setAnalysis((prev) => {
        if (!prev?.rewritePlan) return prev;
        const nextPlan = [...prev.rewritePlan];
        nextPlan[index] = { ...nextPlan[index], rewrittenBullet };
        return { ...prev, rewritePlan: nextPlan };
      });
    } catch (e: any) {
      setError(e?.message || "Rewrite failed");
    } finally {
      setLoadingRewriteIndex(null);
    }
  }

  function handleClearFile() {
    setFile(null);
  }

  const bullets = Array.isArray(analysis?.bullets) ? analysis!.bullets! : [];
  const rewritePlan = Array.isArray(analysis?.rewritePlan)
    ? analysis!.rewritePlan!
    : [];

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Resume MVP</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Upload a resume (PDF/DOCX) or paste it, add a job posting, then analyze
        and rewrite bullets.
      </p>

      {/* Inputs */}
      <section
        style={{
          marginTop: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Resume upload (PDF/DOCX)
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <button type="button" onClick={handleClearFile}>
                Clear file
              </button>
            )}
          </div>
          {file && (
            <div style={{ marginTop: 8, opacity: 0.85 }}>
              Selected: <strong>{file.name}</strong>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Or paste resume text (optional if uploading)
          </div>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={8}
            placeholder="Paste resume text…"
            style={{ width: "100%", padding: 10 }}
          />
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Job posting text (required)
          </div>
          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            rows={8}
            placeholder="Paste job posting…"
            style={{ width: "100%", padding: 10 }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canAnalyze || loadingAnalyze}
            style={{
              padding: "10px 14px",
              fontWeight: 800,
              cursor: !canAnalyze || loadingAnalyze ? "not-allowed" : "pointer",
            }}
          >
            {loadingAnalyze ? "Analyzing…" : "Analyze"}
          </button>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />
            Show debug JSON
          </label>

          {!canAnalyze && (
            <span style={{ opacity: 0.7 }}>
              Add a job posting, and either upload a resume or paste resume
              text.
            </span>
          )}
        </div>

        {error && (
          <div
            style={{
              background: "#ffe8e8",
              border: "1px solid #ffb3b3",
              padding: 12,
              borderRadius: 10,
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}
      </section>

      {/* Results */}
      {analysis && (
        <section
          style={{
            marginTop: 18,
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Analysis Results</h2>

          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            <div>
              <strong>Match Score:</strong>{" "}
              {analysis.matchScore ?? "(not provided)"}
            </div>
            <div>
              <strong>Missing Keywords:</strong>{" "}
              {(analysis.missingKeywords ?? []).length
                ? analysis.missingKeywords?.join(", ")
                : "(none or not provided)"}
            </div>
          </div>

          {/* Bullets */}
          <div style={{ marginTop: 10 }}>
            <h3 style={{ margin: "10px 0" }}>Extracted Bullets</h3>

            {bullets.length ? (
              <ul style={{ marginTop: 6 }}>
                {bullets.slice(0, 30).map((b: any, i: number) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {bulletToText(b)}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ opacity: 0.8 }}>
                No bullets returned. This usually means the resume extraction
                didn’t preserve line breaks or the bullet extractor rules are
                too strict.
              </p>
            )}
          </div>

          {/* Rewrite Plan */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "10px 0" }}>Rewrite Plan</h3>

            {rewritePlan.length ? (
              <div style={{ display: "grid", gap: 14 }}>
                {rewritePlan.map((item: any, i: number) => {
                  const original = planItemToText(item);
                  const suggested = keywordsToArray(item?.suggestedKeywords);

                  return (
                    <div
                      key={i}
                      style={{
                        border: "1px solid #e5e5e5",
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        Bullet {i + 1}
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>Original</div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{original}</div>
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>Suggested keywords</div>
                        <div style={{ opacity: 0.9 }}>
                          {suggested.length ? suggested.join(", ") : "(none)"}
                        </div>
                      </div>

                      {item?.rewrittenBullet && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 700 }}>Rewritten</div>
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {String(item.rewrittenBullet)}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRewriteBullet(i)}
                        disabled={loadingRewriteIndex === i}
                        style={{ padding: "8px 12px", fontWeight: 800 }}
                      >
                        {loadingRewriteIndex === i
                          ? "Rewriting…"
                          : "Rewrite with AI"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ opacity: 0.8 }}>
                No rewrite plan returned. If the response is ok:true, this means
                the server is still producing empty bullets or empty
                suggestions.
              </p>
            )}
          </div>

          {/* Optional Debug */}
          {showDebug && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ margin: "10px 0" }}>Debug JSON</h3>
              <pre style={{ overflowX: "auto" }}>
                {JSON.stringify(analysis, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
