"use client";

import { useMemo, useState } from "react";

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

export default function CoverLetterPage() {
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [tone, setTone] = useState("confident, concise, human");

  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = useMemo(() => {
    return resumeText.trim().length > 50 && jobText.trim().length > 50;
  }, [resumeText, jobText]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setOutput("");

    try {
      const body = {
        resumeText,
        jobText,
        company: company.trim(),
        roleTitle: roleTitle.trim(),
        tone: tone.trim(),
      };

      const endpoints = ["/api/cover-letter", "/api/coverLetter"];

      for (const url of endpoints) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const payload = await parseApiResponse(res);

        // If this endpoint doesn't exist, try the next one
        if (res.status === 404) continue;

        if (isHtmlDoc(payload)) {
          throw new Error(
            `Cover letter API returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`
          );
        }

        if (!res.ok) {
          throw new Error(
            typeof payload === "string"
              ? payload
              : payload?.error || "Cover letter generation failed"
          );
        }

        if (typeof payload === "string") {
          throw new Error("Cover letter API returned unexpected non-JSON response.");
        }

        const letter = String(
          payload?.coverLetter ?? payload?.text ?? payload?.output ?? ""
        ).trim();

        if (!letter) throw new Error("API returned empty cover letter");

        setOutput(letter);
        return;
      }

      throw new Error(
        `No cover letter API route found (404). Tried: ${endpoints.join(", ")}`
      );
    } catch (e: any) {
      setError(e?.message || "Failed to generate cover letter");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (!output) return;
    navigator.clipboard?.writeText(output);
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
        Cover Letter Generator
      </h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Paste resume + job posting → generate a tailored cover letter (separate
        from the resume compiler).
      </p>

      <section
        style={{
          marginTop: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company (optional)"
            style={{ padding: 10 }}
          />
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="Role title (optional)"
            style={{ padding: 10 }}
          />
        </div>

        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="Tone (e.g., confident, concise, human)"
          style={{ padding: 10 }}
        />

        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Resume text</div>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={8}
            placeholder="Paste resume text…"
            style={{ width: "100%", padding: 10 }}
          />
        </div>

        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>
            Job posting text
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
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || loading}
            style={{ padding: "10px 14px", fontWeight: 900 }}
          >
            {loading ? "Generating…" : "Generate cover letter"}
          </button>

          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!output}
            style={{ padding: "10px 14px", fontWeight: 900 }}
          >
            Copy
          </button>
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

      <section style={{ marginTop: 16 }}>
        <h2 style={{ margin: "10px 0" }}>Output</h2>
        {!output ? (
          <div style={{ opacity: 0.75 }}>Generate a letter to see it here.</div>
        ) : (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: 14,
              background: "#fff",
              fontFamily: "inherit",
            }}
          >
            {output}
          </pre>
        )}
      </section>
    </main>
  );
}
