"use client";

import { useMemo, useState } from "react";

type RewritePlanItem = {
  originalBullet?: any;
  suggestedKeywords?: any;

  // existing
  rewrittenBullet?: any;

  // returned from API (per bullet)
  needsMoreInfo?: boolean;
  notes?: string[];
  keywordHits?: string[];
  blockedKeywords?: string[];
};

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  matchScore?: number;
  missingKeywords?: string[];
  bullets?: any[];
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

function bulletToText(b: any): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object") {
    const v = b.text ?? b.value ?? b.bullet ?? b.originalBullet ?? b.content;
    if (typeof v === "string") return v;
    return String(v ?? "");
  }
  return String(b ?? "");
}

function planItemToText(item: any): string {
  if (!item) return "";
  const raw =
    item.originalBullet ?? item.bullet ?? item.original ?? item.text ?? item;
  return bulletToText(raw).trim();
}

function keywordsToArray(k: any): string[] {
  if (Array.isArray(k)) return k.map((x) => String(x).trim()).filter(Boolean);
  if (typeof k === "string")
    return k
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (k && typeof k === "object" && Array.isArray(k.keywords)) {
    return k.keywords.map((x: any) => String(x).trim()).filter(Boolean);
  }
  return [];
}

function csvToArray(s: string): string[] {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeForMatch(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findInjectedTerms(text: string, terms: string[]) {
  const t = normalizeForMatch(text);
  const hits: string[] = [];

  for (const raw of terms) {
    const term = normalizeForMatch(raw);
    if (!term) continue;

    // Simple containment check. This is intentionally blunt—it's a seatbelt.
    if (t.includes(term)) hits.push(raw);
  }

  // de-dupe while keeping original casing
  return Array.from(new Set(hits));
}

function Chip({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: muted ? "#fafafa" : "#f4f4f4",
        color: muted ? "#777" : "#222",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {text}
    </span>
  );
}

function Callout({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone: "warn" | "danger" | "info";
}) {
  const palette =
    tone === "warn"
      ? { bg: "#fff7e6", border: "#ffd38a", title: "#6a4b00" }
      : tone === "danger"
      ? { bg: "#ffe8e8", border: "#ffb3b3", title: "#7a1414" }
      : { bg: "#eef6ff", border: "#b9dcff", title: "#0b3b73" };

  return (
    <div
      style={{
        marginBottom: 10,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        padding: 10,
        borderRadius: 10,
      }}
    >
      <div style={{ fontWeight: 900, color: palette.title }}>{title}</div>
      <div style={{ marginTop: 4, opacity: 0.9 }}>{children}</div>
    </div>
  );
}

export default function Page() {
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Guardrail fields
  const [sourceCompany, setSourceCompany] = useState("Prodigy Education");
  const [targetCompany, setTargetCompany] = useState("");
  const [targetProductsCsv, setTargetProductsCsv] = useState("");
  const [blockedTermsCsv, setBlockedTermsCsv] = useState("");

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingRewriteIndex, setLoadingRewriteIndex] = useState<number | null>(
    null
  );

  const [error, setError] = useState<string | null>(null);
  const [showDebugJson, setShowDebugJson] = useState(false);
  const [logNetworkDebug, setLogNetworkDebug] = useState(true);

  const canAnalyze = useMemo(() => {
    const hasResume = !!file || resumeText.trim().length > 0;
    const hasJob = jobText.trim().length > 0;
    return hasResume && hasJob;
  }, [file, resumeText, jobText]);

  function clearFile() {
    setFile(null);
  }

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
          body: fd,
        });
      } else {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText, jobText }),
        });
      }

      const payload = await parseApiResponse(res);

      if (logNetworkDebug) {
        console.log("[analyze] status:", res.status);
        console.log("[analyze] payload:", payload);
      }

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

  async function postRewriteWithFallback(body: any) {
    const endpoints = ["/api/rewriteBullet", "/api/rewrite-bullet"];

    let lastRes: Response | null = null;
    let lastPayload: any = null;

    for (const url of endpoints) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await parseApiResponse(res);

      if (logNetworkDebug) {
        console.log(`[rewrite] tried ${url} -> status:`, res.status);
        console.log(`[rewrite] payload from ${url}:`, payload);
        console.log(`[rewrite] x-route from ${url}:`, res.headers.get("x-route"));
      }

      if (res.status !== 404) {
        return { res, payload, url };
      }

      lastRes = res;
      lastPayload = payload;
    }

    return {
      res: lastRes!,
      payload: lastPayload,
      url: endpoints[endpoints.length - 1],
    };
  }

  async function handleRewriteBullet(index: number) {
    if (!analysis) return;

    const bullets = Array.isArray(analysis.bullets) ? analysis.bullets : [];
    const rewritePlan = Array.isArray(analysis.rewritePlan)
      ? analysis.rewritePlan
      : [];

    const planItem = rewritePlan[index];

    const originalBullet =
      planItemToText(planItem) || bulletToText(bullets[index]).trim();

    const suggestedKeywords = keywordsToArray(planItem?.suggestedKeywords);

    if (!originalBullet) {
      setError(
        "Missing original bullet for rewrite. Re-run Analyze or confirm bullets are being extracted."
      );
      return;
    }

    setLoadingRewriteIndex(index);
    setError(null);

    try {
      const targetProducts = csvToArray(targetProductsCsv);
      const blockedTerms = csvToArray(blockedTermsCsv);

      const requestBody = {
        originalBullet,
        suggestedKeywords,
        jobText,

        sourceCompany: sourceCompany.trim(),
        targetCompany: targetCompany.trim(),
        targetProducts,
        blockedTerms,

        role: "QA Lead",
        tone: "confident, concise, impact-driven",
      };

      if (logNetworkDebug) {
        console.log("[rewrite] sending:", {
          index,
          originalBullet,
          suggestedKeywords,
          targetCompany: targetCompany.trim(),
          targetProducts,
          blockedTerms,
          jobTextLen: jobText.length,
        });
      }

      const { res, payload } = await postRewriteWithFallback(requestBody);

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
      const needsMoreInfo = !!payload?.needsMoreInfo;
      const notes = Array.isArray(payload?.notes) ? payload.notes : [];
      const keywordHits = Array.isArray(payload?.keywordHits)
        ? payload.keywordHits
        : [];
      const blockedKeywords = Array.isArray(payload?.blockedKeywords)
        ? payload.blockedKeywords
        : [];

      if (!rewrittenBullet) throw new Error("AI returned empty rewrite");

      setAnalysis((prev) => {
        if (!prev) return prev;

        const prevBullets = Array.isArray(prev.bullets) ? prev.bullets : [];
        const prevPlan = Array.isArray(prev.rewritePlan) ? prev.rewritePlan : [];

        const nextPlan =
          prevPlan.length > 0
            ? [...prevPlan]
            : prevBullets.slice(0, 20).map((b) => ({
                originalBullet: bulletToText(b),
                suggestedKeywords: [],
                rewrittenBullet: "",
                needsMoreInfo: false,
                notes: [],
                keywordHits: [],
                blockedKeywords: [],
              }));

        if (!nextPlan[index]) {
          nextPlan[index] = {
            originalBullet,
            suggestedKeywords,
            rewrittenBullet: "",
            needsMoreInfo: false,
            notes: [],
            keywordHits: [],
            blockedKeywords: [],
          };
        }

        nextPlan[index] = {
          ...nextPlan[index],
          rewrittenBullet,
          needsMoreInfo,
          notes,
          keywordHits,
          blockedKeywords,
        };

        return { ...prev, rewritePlan: nextPlan };
      });
    } catch (e: any) {
      setError(e?.message || "Rewrite failed");
    } finally {
      setLoadingRewriteIndex(null);
    }
  }

  const bullets = Array.isArray(analysis?.bullets) ? analysis!.bullets! : [];
  const rewritePlan = Array.isArray(analysis?.rewritePlan)
    ? analysis!.rewritePlan!
    : [];

  // ✅ terms we never want to appear in rewritten bullet (unless user already had them, which we can add later)
  const guardrailTerms = useMemo(() => {
    const terms: string[] = [];
    if (targetCompany.trim()) terms.push(targetCompany.trim());
    terms.push(...csvToArray(targetProductsCsv));
    terms.push(...csvToArray(blockedTermsCsv));
    return terms.filter(Boolean);
  }, [targetCompany, targetProductsCsv, blockedTermsCsv]);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Resume MVP</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Upload a resume (PDF/DOCX) or paste it, add a job posting, then analyze
        and rewrite bullets.
      </p>

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
              <button type="button" onClick={clearFile}>
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

        <div
          style={{
            borderTop: "1px solid #eee",
            paddingTop: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 800 }}>Target guardrails</div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 700 }}>Source company (optional)</label>
            <input
              value={sourceCompany}
              onChange={(e) => setSourceCompany(e.target.value)}
              placeholder="e.g., Prodigy Education"
              style={{ width: "100%", padding: 10 }}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Helps the model keep “past experience” context consistent.
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 700 }}>
              Target company (recommended)
            </label>
            <input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="e.g., Scopely"
              style={{ width: "100%", padding: 10 }}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Used to block company-name injection into your bullet.
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 700 }}>
              Target products (comma-separated, optional)
            </label>
            <input
              value={targetProductsCsv}
              onChange={(e) => setTargetProductsCsv(e.target.value)}
              placeholder="e.g., Monopoly Go, Yahtzee"
              style={{ width: "100%", padding: 10 }}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Used to block product/title injection into your bullet.
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 700 }}>
              Extra blocked terms (comma-separated, optional)
            </label>
            <input
              value={blockedTermsCsv}
              onChange={(e) => setBlockedTermsCsv(e.target.value)}
              placeholder="e.g., Monopoly, Scopely, live ops"
              style={{ width: "100%", padding: 10 }}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Anything you never want the AI to inject unless it already exists
              in your source bullet.
            </div>
          </div>
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
              checked={showDebugJson}
              onChange={(e) => setShowDebugJson(e.target.checked)}
            />
            Show debug JSON
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={logNetworkDebug}
              onChange={(e) => setLogNetworkDebug(e.target.checked)}
            />
            Log network debug
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
                No bullets returned. If you uploaded a PDF, it may have been
                extracted as a single paragraph (or image-only). DOCX usually
                works best.
              </p>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "10px 0" }}>Rewrite Plan</h3>

            {rewritePlan.length ? (
              <div style={{ display: "grid", gap: 14 }}>
                {rewritePlan.map((item: RewritePlanItem, i: number) => {
                  const original = planItemToText(item);
                  const suggested = keywordsToArray(item?.suggestedKeywords);

                  const rewritten = String(item?.rewrittenBullet ?? "").trim();

                  const notes = Array.isArray(item?.notes) ? item.notes : [];
                  const keywordHits = Array.isArray(item?.keywordHits)
                    ? item.keywordHits
                    : [];
                  const blockedKeywords = Array.isArray(item?.blockedKeywords)
                    ? item.blockedKeywords
                    : [];

                  // ✅ client-side guardrail (seatbelt)
                  const injectedHits =
                    guardrailTerms.length && rewritten
                      ? findInjectedTerms(rewritten, guardrailTerms)
                      : [];
                  const rewriteBlockedByGuardrail = injectedHits.length > 0;

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

                      {/* ✅ Standardized callout */}
                      {item?.needsMoreInfo ? (
                        <Callout title="Needs more detail" tone="warn">
                          This bullet reads like a label/definition. Add what
                          you did (tested, validated, documented, improved,
                          owned) so the rewrite stays truthful.
                        </Callout>
                      ) : null}

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

                      {/* ✅ Guardrail warning instead of showing bad output */}
                      {rewriteBlockedByGuardrail ? (
                        <Callout title="Rewrite blocked (guardrail)" tone="danger">
                          The AI output included target-only terms:{" "}
                          <strong>{injectedHits.join(", ")}</strong>. Try removing
                          those keywords or tightening the blocked terms list.
                        </Callout>
                      ) : rewritten ? (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 700 }}>Rewritten</div>
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {rewritten}
                          </div>
                        </div>
                      ) : null}

                      {notes.length ? (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 700 }}>Why this rewrite</div>
                          <ul style={{ marginTop: 6 }}>
                            {notes.slice(0, 4).map((n, idx) => (
                              <li key={idx} style={{ marginBottom: 4 }}>
                                {n}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {keywordHits.length ? (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 700 }}>Keywords used</div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 6,
                            }}
                          >
                            {keywordHits.map((k, idx) => (
                              <Chip key={idx} text={String(k)} />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {blockedKeywords.length ? (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontWeight: 700 }}>Removed keywords</div>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 6,
                            }}
                          >
                            {blockedKeywords.map((k, idx) => (
                              <Chip key={idx} text={String(k)} muted />
                            ))}
                          </div>
                          <div style={{ marginTop: 6, opacity: 0.7 }}>
                            These were removed because they looked like target
                            company/product terms.
                          </div>
                        </div>
                      ) : null}

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
                No rewrite plan returned yet. If bullets exist but rewritePlan
                is empty, your analyze route is likely returning an empty plan.
              </p>
            )}
          </div>

          {showDebugJson && (
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
