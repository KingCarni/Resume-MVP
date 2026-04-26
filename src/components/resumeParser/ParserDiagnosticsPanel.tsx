"use client";

import React, { useMemo, useState } from "react";

export type ParserConfidence = "high" | "medium" | "low";

export type ParserDiagnosticWarning = {
  code?: string;
  message?: string;
  severity?: "info" | "warning" | "error" | string;
};

export type ParserQualityMetrics = {
  textLength?: number;
  sectionCount?: number;
  positionCount?: number;
  bulletCount?: number;
  dateCount?: number;
  contactSignalsFound?: number;
  warningCount?: number;
};

export type ParserDiagnosticsForUi = {
  confidence?: ParserConfidence | string;
  quality?: ParserQualityMetrics | null;
  warnings?: ParserDiagnosticWarning[];
  sectionKinds?: string[];
  jobsDetected?: number;
  bulletsDetected?: number;
};

type ParserDiagnosticsPanelProps = {
  diagnostics?: ParserDiagnosticsForUi | null;
  warnings?: string[];
  extractedText?: string | null;
  className?: string;
};

function normalizeConfidence(value: unknown): ParserConfidence {
  const clean = String(value || "").toLowerCase().trim();
  if (clean === "high" || clean === "medium" || clean === "low") return clean;
  return "low";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const clean = String(value || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }

  return out;
}

function formatWarning(warning: ParserDiagnosticWarning | string) {
  if (typeof warning === "string") return warning.trim();
  return String(warning.message || warning.code || "").trim();
}

function metricLabel(key: keyof ParserQualityMetrics) {
  const labels: Record<keyof ParserQualityMetrics, string> = {
    textLength: "Text length",
    sectionCount: "Sections",
    positionCount: "Positions",
    bulletCount: "Bullets",
    dateCount: "Dates",
    contactSignalsFound: "Contact signals",
    warningCount: "Warnings",
  };

  return labels[key];
}

function confidenceCopy(confidence: ParserConfidence) {
  if (confidence === "high") {
    return {
      title: "Resume parser: high confidence",
      body: "Your resume structure looks usable. We detected enough sections, positions, and bullets to continue normally.",
      tone: "ok" as const,
      badge: "High confidence",
    };
  }

  if (confidence === "medium") {
    return {
      title: "Resume parser: review recommended",
      body: "Your resume text was extracted, but some structure may need a quick review before you trust the preview.",
      tone: "warn" as const,
      badge: "Needs review",
    };
  }

  return {
    title: "Resume parser: structure needs review",
    body: "Your resume text was extracted, but we could not confidently detect the structure. This is not a hard failure â€” review the extracted text before continuing.",
    tone: "danger" as const,
    badge: "Low confidence",
  };
}

export default function ParserDiagnosticsPanel({
  diagnostics,
  warnings = [],
  extractedText,
  className = "",
}: ParserDiagnosticsPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showExtractedText, setShowExtractedText] = useState(false);

  const confidence = normalizeConfidence(diagnostics?.confidence);
  const copy = confidenceCopy(confidence);
  const quality = diagnostics?.quality || null;

  const normalizedWarnings = useMemo(() => {
    return uniqueStrings([
      ...(diagnostics?.warnings || []).map(formatWarning),
      ...warnings,
    ]).slice(0, 8);
  }, [diagnostics?.warnings, warnings]);

  const hasExtractedText = !!String(extractedText || "").trim();
  const shouldShow =
    !!diagnostics ||
    normalizedWarnings.length > 0 ||
    confidence !== "high";

  if (!shouldShow) return null;

  const toneClasses =
    copy.tone === "ok"
      ? "border-emerald-300/60 bg-emerald-100/70 text-emerald-950 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100"
      : copy.tone === "warn"
      ? "border-amber-300/70 bg-amber-100/80 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
      : "border-rose-300/70 bg-rose-100/80 text-rose-950 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100";

  const badgeClasses =
    copy.tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/15"
      : copy.tone === "warn"
      ? "border-amber-500/30 bg-amber-500/15"
      : "border-rose-500/30 bg-rose-500/15";

  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${toneClasses} ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold">{copy.title}</h3>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${badgeClasses}`}>
              {copy.badge}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold opacity-90">{copy.body}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="rounded-xl border border-current/20 bg-white/45 px-3 py-2 text-xs font-extrabold shadow-sm hover:bg-white/65 dark:bg-black/20 dark:hover:bg-black/30"
          >
            {showDetails ? "Hide details" : "Parser details"}
          </button>

          {hasExtractedText ? (
            <button
              type="button"
              onClick={() => setShowExtractedText((value) => !value)}
              className="rounded-xl border border-current/20 bg-white/45 px-3 py-2 text-xs font-extrabold shadow-sm hover:bg-white/65 dark:bg-black/20 dark:hover:bg-black/30"
            >
              {showExtractedText ? "Hide text" : "Review text"}
            </button>
          ) : null}
        </div>
      </div>

      {normalizedWarnings.length ? (
        <div className="mt-3 rounded-xl border border-current/15 bg-white/35 p-3 dark:bg-black/15">
          <div className="text-xs font-black uppercase tracking-wide opacity-75">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold opacity-90">
            {normalizedWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {showDetails ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {quality
            ? (Object.entries(quality) as Array<[keyof ParserQualityMetrics, number | undefined]>).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-current/15 bg-white/35 p-3 dark:bg-black/15">
                  <div className="text-[11px] font-black uppercase tracking-wide opacity-70">{metricLabel(key)}</div>
                  <div className="mt-1 text-lg font-black">{typeof value === "number" ? value : "â€”"}</div>
                </div>
              ))
            : null}

          <div className="rounded-xl border border-current/15 bg-white/35 p-3 dark:bg-black/15">
            <div className="text-[11px] font-black uppercase tracking-wide opacity-70">Sections</div>
            <div className="mt-1 text-sm font-extrabold">
              {diagnostics?.sectionKinds?.length ? diagnostics.sectionKinds.join(", ") : "â€”"}
            </div>
          </div>
        </div>
      ) : null}

      {showExtractedText && hasExtractedText ? (
        <div className="mt-3 rounded-xl border border-current/15 bg-white/45 p-3 dark:bg-black/20">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-black uppercase tracking-wide opacity-75">Extracted resume text</div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(String(extractedText || ""))}
              className="rounded-lg border border-current/20 bg-white/45 px-2.5 py-1 text-xs font-extrabold hover:bg-white/65 dark:bg-black/20 dark:hover:bg-black/30"
            >
              Copy
            </button>
          </div>
          <textarea
            readOnly
            value={String(extractedText || "")}
            className="min-h-[260px] w-full resize-y rounded-lg border border-current/15 bg-white/80 p-3 font-mono text-xs leading-relaxed text-slate-950 outline-none dark:bg-black/35 dark:text-slate-100"
          />
          <p className="mt-2 text-xs font-semibold opacity-75">
            This is a review fallback only. Editing/saving reviewed parser text can be added in a later pass.
          </p>
        </div>
      ) : null}
    </section>
  );
}
