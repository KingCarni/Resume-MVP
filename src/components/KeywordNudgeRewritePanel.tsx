"use client";

import React, { useMemo, useState } from "react";

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function splitKeywords(input: string): string[] {
  return (input || "")
    .split(/[\n,]+/g)
    .map((k) => k.trim())
    .filter(Boolean);
}

function sanitizeKeywordList(params: {
  raw: string[];
  targetCompany?: string;
  targetProducts?: string[];
}): { usable: string[]; removed: string[] } {
  const { raw, targetCompany, targetProducts } = params;

  const blocked = [targetCompany || "", ...(targetProducts || [])]
    .map((x) => x.trim())
    .filter(Boolean);

  const usable: string[] = [];
  const removed: string[] = [];

  for (const k of raw) {
    const kNorm = normalize(k);

    const isBlocked = blocked.some((b) => {
      const bNorm = normalize(b);
      return bNorm && (kNorm.includes(bNorm) || bNorm.includes(kNorm));
    });

    if (isBlocked) removed.push(k);
    else usable.push(k);
  }

  // de-dupe, preserve order
  const dedupe = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of arr) {
      const key = normalize(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  return { usable: dedupe(usable), removed: dedupe(removed) };
}

type RewriteApiResponse = {
  ok: boolean;
  rewrittenBullet?: string;
  error?: string;
  notes?: string[];
  keywordHits?: string[];
  blockedKeywords?: string[];
  needsMoreInfo?: boolean;
};

type Props = {
  // Minimal props so you can plug this in anywhere
  defaultOriginalBullet?: string;
  defaultJobText?: string;
  defaultTargetCompany?: string; // e.g. "Scopely"
  defaultTargetProducts?: string[]; // e.g. ["Monopoly GO!", "Monopoly"]
  defaultRole?: string;
  defaultTone?: string;
};

export default function KeywordNudgeRewritePanel({
  defaultOriginalBullet = "",
  defaultJobText = "",
  defaultTargetCompany = "",
  defaultTargetProducts = [],
  defaultRole = "QA",
  defaultTone = "confident, concise, metric-driven",
}: Props) {
  const [originalBullet, setOriginalBullet] = useState(defaultOriginalBullet);
  const [jobText, setJobText] = useState(defaultJobText);
  const [keywordsText, setKeywordsText] = useState("");
  const [targetCompany, setTargetCompany] = useState(defaultTargetCompany);
  const [targetProducts, setTargetProducts] = useState(
    (defaultTargetProducts || []).join(", ")
  );
  const [role, setRole] = useState(defaultRole);
  const [tone, setTone] = useState(defaultTone);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RewriteApiResponse | null>(null);

  const rawKeywords = useMemo(() => splitKeywords(keywordsText), [keywordsText]);

  const targetProductsList = useMemo(
    () =>
      splitKeywords(targetProducts).map((p) => p.trim()).filter(Boolean),
    [targetProducts]
  );

  const { usable, removed } = useMemo(
    () =>
      sanitizeKeywordList({
        raw: rawKeywords,
        targetCompany,
        targetProducts: targetProductsList,
      }),
    [rawKeywords, targetCompany, targetProductsList]
  );

  async function onRewrite() {
    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/rewrite-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalBullet,
          jobText,
          suggestedKeywords: usable, // ✅ sanitized list only
          role,
          tone,
          sourceCompany: "", // optional — you can wire this in later
          targetCompany, // ✅ server can enforce too
          targetProducts: targetProductsList, // ✅ server can enforce too
        }),
      });

      const data = (await res.json()) as RewriteApiResponse;
      setResult(data);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "Request failed" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Rewrite Bullet (with keyword nudge + sanitizing)
      </h2>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>Original bullet (from resume)</div>
          <textarea
            value={originalBullet}
            onChange={(e) => setOriginalBullet(e.target.value)}
            rows={3}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #444" }}
            placeholder='e.g. "Validated purchase flow for premium currency..."'
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>Job posting text (target context)</div>
          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            rows={5}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #444" }}
            placeholder="Paste job posting here"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Target company</div>
            <input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #444" }}
              placeholder='e.g. "Scopely"'
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Target products (comma/newline)</div>
            <input
              value={targetProducts}
              onChange={(e) => setTargetProducts(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #444" }}
              placeholder='e.g. "Monopoly GO!, Monopoly"'
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Role focus</div>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #444" }}
              placeholder='e.g. "QA"'
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Tone</div>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #444" }}
              placeholder='e.g. "confident, concise, metric-driven"'
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>Suggested keywords (skills only)</div>
          <textarea
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            rows={3}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #444" }}
            placeholder={`e.g.\nrisk-based testing\nConfluence\business priorities\nAPI testing`}
          />

          {/* ✅ UI nudge */}
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
            Use <b>skills and responsibilities</b> (e.g., “risk-based testing”, “Confluence”,
            “business priorities”).{" "}
            <b>
              Company and product names (e.g., “Scopely”, “Monopoly GO!”) won’t be inserted into
              your resume.
            </b>
          </div>

          {/* ✅ Show what gets removed */}
          {removed.length > 0 && (
            <div
              style={{
                marginTop: 8,
                border: "1px solid #555",
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Removed from keywords
              </div>
              <div style={{ opacity: 0.85 }}>
                {removed.join(", ")} (company/product identifiers)
              </div>
            </div>
          )}

          {/* ✅ Show what will actually be sent */}
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            Will send keywords: {usable.length ? usable.join(", ") : "(none)"}
          </div>
        </label>

        <button
          onClick={onRewrite}
          disabled={isLoading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #444",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {isLoading ? "Rewriting..." : "Rewrite with AI"}
        </button>

        {result && (
          <div
            style={{
              border: "1px solid #444",
              borderRadius: 10,
              padding: 12,
              marginTop: 6,
            }}
          >
            {!result.ok ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
                <div style={{ opacity: 0.9 }}>{result.error}</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Rewritten</div>
                <div style={{ whiteSpace: "pre-wrap", opacity: 0.95 }}>
                  {result.rewrittenBullet}
                </div>

                {result.needsMoreInfo && (
                  <div style={{ marginTop: 10, opacity: 0.9, fontSize: 13 }}>
                    <b>Needs more info:</b> This bullet may be too thin to rewrite without
                    inventing details. Add what you did (tested, validated, documented, improved).
                  </div>
                )}

                {Array.isArray(result.notes) && result.notes.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Notes</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {result.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(result.keywordHits) && result.keywordHits.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Keyword hits</div>
                    <div>{result.keywordHits.join(", ")}</div>
                  </div>
                )}

                {/* If your API returns blockedKeywords too, show it (optional) */}
                {Array.isArray(result.blockedKeywords) &&
                  result.blockedKeywords.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        Blocked by API
                      </div>
                      <div>{result.blockedKeywords.join(", ")}</div>
                    </div>
                  )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
