// src/components/CoverLetterGenerator.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackJobEvent } from "@/lib/analytics/jobs";

/** ---------------- Types ---------------- */

type ResumeTemplateId =
  | "modern"
  | "classic"
  | "minimal"
  | "executive"
  | "compact"
  | "sidebar"
  | "serif"
  | "ats"
  | "arcade"
  | "neon"
  | "terminal"
  | "blueprint"
  | "monochrome"
  | "noir"
  | "paper"
  | "ink"
  | "corporate"
  | "contrast"
  | "minimalist"
  | "grid"
  | "retro"
  | "pastel"
  | "aura"
  | "lavender"
  | "sunset"
  | "forest"
  | "ocean"
  | "sand"
  | "royal"
  | "gold"
  | "bubblegum"
  | "limepop"
  | "citrus"
  | "electric"
  | "confetti"
  | "rainbow"
  | "sunny"
  | "watermelon"
  | "grape"
  | "tropical"
  | "mint"
  | "sky"
  | "coral"
  | "flamingo"
  | "popart"
  | "arcade2"
  | "hologram"
  | "galaxy"
  | "synthwave"
  | "lava"
  | "lemonade"
  | "cottoncandy"
  | "sprinkles"
  | "comic"
  | "playground";

type ResumeProfile = {
  fullName: string;
  locationLine: string;
  email: string;
  phone: string;
  linkedin: string;
};

type ApiResp = { ok: true; coverLetter: string } | { ok: false; error?: string };

type ApplyPackBundle = {
  bundle?: string;
  jobId?: string;
  resumeProfileId?: string;
  nextStep?: string;
  createdAt?: string;
  bundleSessionId?: string;
  sourceSlug?: string;
  job?: {
    id?: string;
    title?: string;
    company?: string;
    location?: string | null;
    remoteType?: string;
    seniority?: string;
    employmentType?: string;
    applyUrl?: string | null;
    sourceUrl?: string | null;
    description?: string;
    requirementsText?: string | null;
    responsibilitiesText?: string | null;
    postedAt?: string | null;
    jobContextText?: string;
  };
};

/** ---------------- Templates (MATCH RESUME 1:1) ---------------- */

const TEMPLATE_OPTIONS: Array<{ id: ResumeTemplateId; label: string }> = [
  { id: "modern", label: "Modern (clean)" },
  { id: "classic", label: "Classic (standard)" },
  { id: "minimal", label: "Minimal (serif-lite)" },
  { id: "executive", label: "Executive (premium)" },
  { id: "compact", label: "Compact (dense)" },
  { id: "sidebar", label: "Sidebar (2-column)" },
  { id: "serif", label: "Serif (traditional)" },
  { id: "ats", label: "ATS (plain)" },
  { id: "arcade", label: "Arcade (fun)" },
  { id: "neon", label: "Neon (cyber)" },
  { id: "terminal", label: "Terminal (dev)" },
  { id: "blueprint", label: "Blueprint (tech)" },

  { id: "monochrome", label: "Monochrome (sleek)" },
  { id: "noir", label: "Noir (moody)" },
  { id: "paper", label: "Paper (warm serif)" },
  { id: "ink", label: "Ink (dashed editorial)" },
  { id: "corporate", label: "Corporate (polished)" },
  { id: "contrast", label: "High Contrast (bold)" },
  { id: "minimalist", label: "Minimalist (soft)" },
  { id: "grid", label: "Grid (blueprint+)" },
  { id: "retro", label: "Retro (sunburst)" },
  { id: "pastel", label: "Pastel (gentle)" },
  { id: "aura", label: "Aura (teal/green)" },
  { id: "lavender", label: "Lavender (calm)" },
  { id: "sunset", label: "Sunset (pink/orange)" },
  { id: "forest", label: "Forest (green)" },
  { id: "ocean", label: "Ocean (blue)" },
  { id: "sand", label: "Sand (golden)" },
  { id: "royal", label: "Royal (blue/purple)" },
  { id: "gold", label: "Gold (premium)" },
  { id: "bubblegum", label: "Bubblegum (pink pop)" },
  { id: "limepop", label: "Lime Pop (bright green)" },
  { id: "citrus", label: "Citrus (orange/lemon)" },
  { id: "electric", label: "Electric (cyan/purple)" },
  { id: "confetti", label: "Confetti (party)" },
  { id: "rainbow", label: "Rainbow (bold)" },
  { id: "sunny", label: "Sunny (yellow)" },
  { id: "watermelon", label: "Watermelon (pink/green)" },
  { id: "grape", label: "Grape (purple)" },
  { id: "tropical", label: "Tropical (teal/coral)" },
  { id: "mint", label: "Mint (fresh)" },
  { id: "sky", label: "Sky (bright blue)" },
  { id: "coral", label: "Coral (warm)" },
  { id: "flamingo", label: "Flamingo (hot pink)" },
  { id: "popart", label: "Pop Art (comic)" },
  { id: "arcade2", label: "Arcade+ (extra fun)" },
  { id: "hologram", label: "Hologram (iridescent)" },
  { id: "galaxy", label: "Galaxy (space neon)" },
  { id: "synthwave", label: "Synthwave (80s)" },
  { id: "lava", label: "Lava (red/orange)" },
  { id: "lemonade", label: "Lemonade (summer)" },
  { id: "cottoncandy", label: "Cotton Candy (pastel pop)" },
  { id: "sprinkles", label: "Sprinkles (cute)" },
  { id: "comic", label: "Comic (ink + color)" },
  { id: "playground", label: "Playground (primary)" },
];

/** ---------------- UI bits ---------------- */

function Callout({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone: "warn" | "danger" | "info";
}) {
  const toneClasses =
    tone === "warn"
      ? "border-amber-300/60 bg-amber-100/60 text-amber-950 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"
      : tone === "danger"
      ? "border-red-300/60 bg-red-100/60 text-red-950 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100"
      : "border-sky-300/60 bg-sky-100/60 text-sky-950 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100";

  return (
    <div className={`rounded-xl border p-3 ${toneClasses}`}>
      <div className="font-extrabold">{title}</div>
      <div className="mt-1 opacity-50">{children}</div>
    </div>
  );
}

async function downloadPdfFromHtml(filename: string, html: string) {
  const ref =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const res = await fetch("/api/render-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, filename, ref }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PDF render failed (${res.status}). ${text}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function openHtmlPreviewInNewWindow(title: string, html: string) {
  const docHtml =
    html && String(html).trim()
      ? String(html)
      : `<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body></body></html>`;

  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Preview popup was blocked by the browser.");
  }

  try {
    win.focus();
  } catch {}

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 60000);
}


/** ---------------- HTML templates (MATCH RESUME STYLES) ---------------- */

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mkThemeCss(opts: {
  font?: "sans" | "serif" | "mono";
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2?: string;

  pageBg?: string;
  bodyBg?: string;

  headerBg?: string;
  cardBg?: string;

  borderStyle?: "solid" | "dashed" | "dotted";
  radius?: number;
  shadow?: string;
  headerAfterGrid?: boolean;
  hasChips?: boolean;
}) {
  const fontFamily =
    opts.font === "mono"
      ? `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
      : opts.font === "serif"
      ? `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
      : `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

  const radius = typeof opts.radius === "number" ? opts.radius : 16;
  const borderStyle = opts.borderStyle || "solid";
  const shadow = opts.shadow || "0 10px 30px rgba(0,0,0,.06)";

  const bodyBg = opts.bodyBg || "#fff";
  const pageBg = opts.pageBg || "#fff";

  const headerBg =
    opts.headerBg ||
    "linear-gradient(180deg, rgba(0,0,0,.04), rgba(255,255,255,0))";
  const cardBg = opts.cardBg || "#fff";
  const accent2 = opts.accent2 || opts.accent;

  return `
    :root {
      --ink:${opts.ink};
      --muted:${opts.muted};
      --line:${opts.line};
      --accent:${opts.accent};
      --accent2:${accent2};

      --headerbg:${headerBg};
      --pagebg:${pageBg};
      --bodybg:${bodyBg};
      --cardbg:${cardBg};

      --radius:${radius}px;
      --shadow:${shadow};
      --borderstyle:${borderStyle};
    }

    body { font-family: ${fontFamily}; color:var(--ink); margin:0; background:var(--bodybg); }
    .page { max-width: 860px; margin: 22px auto; background:var(--pagebg); border:1px ${borderStyle} var(--line); border-radius:${radius}px; overflow:hidden; box-shadow:${shadow}; }
    .top { padding: 24px 26px 18px; background:var(--headerbg); border-bottom:1px ${borderStyle} var(--line); position:relative; }
    ${
      opts.headerAfterGrid
        ? `.top:after { content:""; position:absolute; inset:0; background-image: linear-gradient(rgba(0,0,0,0) 24px, rgba(0,0,0,.04) 25px); background-size: 100% 25px; pointer-events:none; }`
        : ""
    }
    .name { font-size: 30px; font-weight: 950; letter-spacing: -.02em; margin:0; }
    .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:800; }
    .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
    .chip { display:inline-block; border:1px ${borderStyle} var(--line); padding:6px 10px; border-radius: 999px; background:${
      opts.hasChips ? "rgba(255,255,255,.9)" : "transparent"
    }; }
    .content { padding: 18px 26px 26px; }
    .section { margin-top: 16px; }
    .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 950; letter-spacing: .10em; text-transform:uppercase; }
    .bar { height: 10px; width: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
    .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
    .job { margin-top: 12px; border:1px ${borderStyle} var(--line); border-radius: ${Math.max(
      10,
      radius - 2
    )}px; padding: 12px; background:var(--cardbg); }
    .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .jobtitle { font-weight: 950; }
    .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
    ul { margin: 8px 0 0 18px; padding:0; }
    li { margin: 6px 0; line-height: 1.35; }
    .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .box { border:1px ${borderStyle} var(--line); border-radius: ${Math.max(
      10,
      radius - 2
    )}px; padding: 12px; background:var(--cardbg); }
    .boxtitle { font-weight: 950; font-size: 12px; color: var(--ink); margin:0 0 6px; }
    .small { font-size: 12px; color: var(--muted); }
  `;
}

function templateStyles(template: ResumeTemplateId) {
  // ---------- EXISTING THEMES ----------
  if (template === "modern") {
    return `
      :root {
        --ink:#111; --muted:#555; --line:#e7e7e7; --accent:#0b57d0;
        --headerbg: linear-gradient(180deg, rgba(11,87,208,.08), rgba(255,255,255,0));
        --pagebg: white;
        --bodybg: #f6f7fb;
        --radius: 16px;
        --shadow: 0 10px 30px rgba(0,0,0,.06);
        --borderstyle: solid;
      }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 860px; margin: 22px auto; background:var(--pagebg); border:1px solid var(--line); border-radius: 16px; overflow:hidden; box-shadow: 0 10px 30px rgba(0,0,0,.06); }
      .top { display:grid; grid-template-columns: 1.2fr 0.8fr; gap: 18px; padding: 26px 26px 18px; background: var(--headerbg); border-bottom:1px solid var(--line); }
      .name { font-size: 30px; font-weight: 900; letter-spacing: -.02em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:700; }
      .contact { font-size: 12px; color:var(--muted); display:grid; gap: 6px; justify-items:end; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; }
      .content { padding: 18px 26px 26px; }
      .section { margin-top: 16px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 900; letter-spacing: .08em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: var(--accent); }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 12px; border:1px solid var(--line); border-radius: 12px; padding: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); border-radius: 12px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 900; font-size: 12px; color: var(--ink); margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "minimal") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; --radius: 0px; --shadow: none; --borderstyle: solid; --pagebg:#fff; --bodybg:#fff; --headerbg:#fff; }
      body { font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 820px; margin: 26px auto; padding: 0 22px 22px; background:var(--pagebg); }
      .top { padding: 16px 0 10px; border-bottom: 1px solid var(--line); background:var(--headerbg); }
      .name { font-size: 30px; font-weight: 800; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); }
      .contact { margin-top:10px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .content { padding-top: 10px; }
      .h { margin: 14px 0 6px; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform:uppercase; }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 10px; padding-top: 10px; border-top:1px solid var(--line); }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border-top:1px solid var(--line); padding-top:10px; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "arcade") {
    return `
      :root {
        --ink:#120a2a; --muted:#3b2a66; --line:#e7d7ff; --accent:#7c3aed; --accent2:#06b6d4;
        --headerbg: linear-gradient(135deg, rgba(124,58,237,.16), rgba(6,182,212,.10));
        --bodybg:
          radial-gradient(1200px 600px at 10% 10%, rgba(124,58,237,.12), rgba(255,255,255,0)),
          radial-gradient(1000px 600px at 90% 20%, rgba(6,182,212,.10), rgba(255,255,255,0)),
          #fbf7ff;
        --pagebg: #fbf7ff;
        --radius: 18px;
        --shadow: 0 14px 40px rgba(18,10,42,.10);
        --borderstyle: solid;
      }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 860px; margin: 22px auto; background:var(--pagebg); border:1px solid var(--line); border-radius: 18px; overflow:hidden; box-shadow: 0 14px 40px rgba(18,10,42,.10); }
      .top { padding: 24px 26px 18px; background: var(--headerbg); border-bottom:1px solid var(--line); position:relative; }
      .top:after { content:""; position:absolute; inset:0; background-image: linear-gradient(rgba(0,0,0,0) 24px, rgba(18,10,42,.03) 25px); background-size: 100% 25px; pointer-events:none; }
      .name { font-size: 32px; font-weight: 1000; letter-spacing: -.03em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:800; }
      .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; box-shadow: 0 2px 0 rgba(124,58,237,.08); }
      .content { padding: 18px 26px 26px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 1000; letter-spacing: .10em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
      .job { margin-top: 12px; border:1px solid var(--line); border-radius: 14px; padding: 12px; background: linear-gradient(180deg, rgba(124,58,237,.04), rgba(255,255,255,0)); }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 1000; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); border-radius: 14px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 1000; font-size: 12px; color: var(--ink); margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "neon") {
    return `
      :root {
        --ink:#0b1020; --muted:#2a3558; --line:#dde3ff; --accent:#00e5ff; --accent2:#ff00e5;
        --headerbg: linear-gradient(135deg, rgba(0,229,255,.12), rgba(255,0,229,.08));
        --bodybg:
          radial-gradient(900px 500px at 20% 10%, rgba(0,229,255,.14), rgba(255,255,255,0)),
          radial-gradient(900px 500px at 80% 20%, rgba(255,0,229,.10), rgba(255,255,255,0)),
          #f7f9ff;
        --pagebg: #eef7ff;
        --radius: 18px;
        --shadow: 0 18px 50px rgba(11,16,32,.10);
        --borderstyle: solid;
      }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 860px; margin: 22px auto; background:var(--pagebg); border:1px solid var(--line); border-radius: 18px; overflow:hidden; box-shadow: 0 18px 50px rgba(11,16,32,.10); }
      .top { padding: 26px; border-bottom:1px solid var(--line); background: var(--headerbg); }
      .name { font-size: 32px; font-weight: 950; letter-spacing: -.03em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:900; }
      .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; box-shadow: 0 0 0 2px rgba(0,229,255,.06), 0 0 0 2px rgba(255,0,229,.04) inset; }
      .content { padding: 18px 26px 26px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 950; letter-spacing: .12em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); box-shadow: 0 0 12px rgba(0,229,255,.24); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
      .job { margin-top: 12px; border:1px solid var(--line); border-radius: 14px; padding: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:900; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); border-radius: 14px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "terminal") {
    return `
      :root {
        --ink:#e6f3ea; --muted:#b7d6c2; --line:#2a4f3a; --accent:#39ff14;
        --headerbg: linear-gradient(180deg, rgba(57,255,20,.10), rgba(0,0,0,0));
        --pagebg: #071f13;
        --bodybg: #061a10;
        --radius: 14px;
        --shadow: 0 14px 40px rgba(0,0,0,.35);
        --borderstyle: solid;
        --cardbg: #061a10;
      }
      body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 900px; margin: 18px auto; border:1px solid var(--line); background:var(--pagebg); border-radius: 14px; overflow:hidden; box-shadow: 0 14px 40px rgba(0,0,0,.35); }
      .top { padding: 18px 18px 14px; border-bottom:1px solid var(--line); background: var(--headerbg); }
      .name { font-size: 26px; font-weight: 900; margin:0; color:var(--accent); }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:800; }
      .contact { margin-top:10px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:#062014; color:var(--ink); }
      .content { padding: 14px 18px 18px; }
      .h { margin: 14px 0 6px; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform:uppercase; color:var(--accent); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 12.5px; }
      .job { margin-top: 10px; border-top:1px dashed var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.4; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 10px; background:#061a10; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; color:var(--accent); }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "blueprint") {
    return `
      :root {
        --ink:#0b1a2a; --muted:#2a4a6a; --line:#cfe7ff; --accent:#0b57d0;
        --headerbg: linear-gradient(180deg, rgba(11,87,208,.08), rgba(255,255,255,0));
        --bodybg:
          linear-gradient(90deg, rgba(11,87,208,.05) 1px, rgba(255,255,255,0) 1px),
          linear-gradient(180deg, rgba(11,87,208,.05) 1px, rgba(255,255,255,0) 1px),
          #f7fbff;
        --pagebg: #f7fbff;
        --radius: 16px;
        --shadow: 0 10px 30px rgba(11,26,42,.08);
        --borderstyle: dashed;
      }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:var(--bodybg); background-size: 26px 26px; }
      .page { max-width: 860px; margin: 22px auto; background:var(--pagebg); border:1px solid var(--line); border-radius: 16px; overflow:hidden; box-shadow: 0 10px 30px rgba(11,26,42,.08); }
      .top { padding: 22px 26px 18px; border-bottom:1px solid var(--line); background: var(--headerbg); }
      .name { font-size: 30px; font-weight: 950; letter-spacing: -.02em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:800; }
      .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; }
      .content { padding: 18px 26px 26px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 950; letter-spacing: .10em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: var(--accent); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
      .job { margin-top: 12px; border:1px dashed var(--line); border-radius: 14px; padding: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px dashed var(--line); border-radius: 14px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "executive") {
    return `
      :root { --ink:#0f172a; --muted:#475569; --line:#e2e8f0; --accent:#111827; --radius: 0px; --shadow: none; --borderstyle: solid; --pagebg:#fff; --bodybg:#fff; --headerbg:#fff; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 900px; margin: 22px auto; background:var(--pagebg); border:1px solid var(--line); padding: 22px 26px; }
      .top { display:flex; justify-content:space-between; gap: 16px; border-bottom:1px solid var(--line); padding-bottom: 14px; background:var(--headerbg); }
      .name { font-size: 30px; font-weight: 950; margin:0; letter-spacing:-.02em; }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:800; }
      .contact { font-size: 12px; color:var(--muted); text-align:right; display:grid; gap:4px; font-weight:700; }
      .h { margin: 16px 0 8px; font-size: 12px; font-weight: 950; letter-spacing: .14em; text-transform:uppercase; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.55; font-size: 13px; }
      .job { margin-top: 12px; border-top:1px solid var(--line); padding-top: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.45; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 12px; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "compact") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; --accent:#111827; --radius: 0px; --shadow: none; --borderstyle: solid; --pagebg:#fff; --bodybg:#fff; --headerbg:#fff; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 900px; margin: 16px auto; background:var(--pagebg); border: 1px solid var(--line); padding: 14px 18px; }
      .top { display:flex; justify-content:space-between; gap: 10px; border-bottom:1px solid var(--line); padding-bottom: 8px; background:var(--headerbg); }
      .name { font-size: 24px; font-weight: 950; margin:0; }
      .title { margin-top:4px; font-size: 12px; color:var(--muted); font-weight:800; }
      .contact { font-size: 11px; color:var(--muted); text-align:right; display:grid; gap:2px; font-weight:700; }
      .h { margin: 10px 0 4px; font-size: 12px; font-weight: 950; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.35; font-size: 12px; }
      .job { margin-top: 8px; border-top:1px solid var(--line); padding-top: 8px; }
      .jobhead { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 11px; font-weight:800; }
      ul { margin: 6px 0 0 16px; padding:0; }
      li { margin: 4px 0; line-height: 1.28; font-size: 12px; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 950; font-size: 11px; margin:0 0 6px; }
      .small { font-size: 11px; color: var(--muted); }
    `;
  }

  if (template === "sidebar") {
    return `
      :root { --ink:#111; --muted:#555; --line:#e7e7e7; --accent:#0b57d0; --side:#f4f6fb; --radius: 16px; --shadow: none; --borderstyle: solid; --pagebg:#fff; --bodybg:#fff; --headerbg:#fff; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 980px; margin: 22px auto; background:var(--pagebg); border:1px solid var(--line); border-radius: 16px; overflow:hidden; display:grid; grid-template-columns: 280px 1fr; }
      .top { grid-column: 1 / -1; display:none; }
      .side { background: var(--side); padding: 18px; border-right:1px solid var(--line); }
      .main { padding: 18px 22px; }
      .name { font-size: 24px; font-weight: 950; margin:0; }
      .title { margin-top:6px; font-size: 12px; color:var(--muted); font-weight:800; }
      .contact { margin-top:10px; font-size: 12px; color:var(--muted); display:grid; gap:6px; font-weight:700; }
      .h { margin: 14px 0 6px; font-size: 12px; font-weight: 950; letter-spacing: .12em; text-transform:uppercase; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr; gap: 10px; }
      .box { border:1px solid var(--line); border-radius: 12px; padding: 10px; background:#fff; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      .content { padding:0; }
      .section { margin-top: 0; }
    `;
  }

  if (template === "serif") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; --accent:#0f172a; --radius: 0px; --shadow: none; --borderstyle: solid; --pagebg:#fff; --bodybg:#fafafa; --headerbg:#fff; }
      body { font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 860px; margin: 22px auto; background:var(--pagebg); border:1px solid var(--line); padding: 22px 26px; }
      .top { display:flex; justify-content:space-between; gap: 16px; border-bottom:2px solid var(--line); padding-bottom: 12px; background:var(--headerbg); }
      .name { font-size: 30px; font-weight: 800; margin:0; }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:700; }
      .contact { font-size: 12px; color:var(--muted); text-align:right; display:grid; gap:4px; font-weight:700; }
      .h { margin: 14px 0 6px; font-size: 13px; font-weight: 900; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.55; font-size: 13px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.45; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  if (template === "ats") {
    return `
      :root { --ink:#111; --muted:#333; --line:#ddd; --accent:#111; --radius: 0px; --shadow: none; --borderstyle: solid; --pagebg:#fff; --bodybg:#fff; --headerbg:#fff; }
      body { font-family: Arial, Helvetica, sans-serif; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 900px; margin: 16px auto; background:var(--pagebg); padding: 16px 18px; }
      .top { display:flex; justify-content:space-between; gap: 12px; border-bottom:1px solid var(--line); padding-bottom: 10px; background:var(--headerbg); }
      .name { font-size: 24px; font-weight: 800; margin:0; }
      .title { margin-top:6px; font-size: 12px; color:var(--muted); font-weight:700; }
      .contact { font-size: 11px; color:var(--muted); text-align:right; display:grid; gap:3px; font-weight:700; }
      .h { margin: 12px 0 6px; font-size: 12px; font-weight: 800; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.4; font-size: 12px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 800; }
      .jobmeta { color: var(--muted); font-size: 11px; font-weight:700; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 5px 0; line-height: 1.35; font-size: 12px; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 800; font-size: 11px; margin:0 0 6px; }
      .small { font-size: 11px; color: var(--muted); }
    `;
  }

  // classic fallback
  if (template === "classic") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; --accent:#1f2937; --radius: 0px; --shadow: none; --borderstyle: solid; --pagebg:#fff; --bodybg:#fff; --headerbg:#fff; }
      body { font-family: Calibri, Arial, Helvetica, sans-serif; color:var(--ink); margin:0; background:var(--bodybg); }
      .page { max-width: 850px; margin: 18px auto; background:var(--pagebg); border: 1px solid var(--line); padding: 18px 22px; }
      .top { display:flex; justify-content:space-between; gap: 12px; border-bottom:1px solid var(--line); padding-bottom: 10px; background:var(--headerbg); }
      .name { font-size: 28px; font-weight: 900; margin:0; }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:700; }
      .contact { font-size: 12px; color:var(--muted); text-align:right; display:grid; gap:4px; }
      .h { margin: 14px 0 6px; font-size: 13px; font-weight: 900; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
    `;
  }

  // ---------- NEW THEMES ----------
  if (template === "monochrome") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "#334155",
      line: "#e2e8f0",
      accent: "#111827",
      bodyBg: "#f8fafc",
      pageBg: "#f8fafc",
      headerBg: "linear-gradient(180deg, rgba(15,23,42,.08), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 45px rgba(2,6,23,.08)",
      hasChips: true,
    });
  }

  if (template === "noir") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#2b3446",
      line: "#e5e7eb",
      accent: "#0b0f18",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(15,23,42,.10), rgba(255,255,255,0)), #f6f7fb",
      pageBg: "#f6f7fb",
      headerBg: "linear-gradient(135deg, rgba(2,6,23,.10), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      radius: 16,
      shadow: "0 18px 55px rgba(2,6,23,.12)",
      hasChips: true,
    });
  }

  if (template === "paper") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f2937",
      muted: "#4b5563",
      line: "#e5e7eb",
      accent: "#1f2937",
      bodyBg:
        "radial-gradient(900px 480px at 20% 10%, rgba(17,24,39,.06), rgba(255,255,255,0)), #fffdf7",
      pageBg: "#fffdf7",
      headerBg: "linear-gradient(180deg, rgba(245,158,11,.08), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 12,
      shadow: "0 10px 28px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "ink") {
    return mkThemeCss({
      font: "serif",
      ink: "#0b1220",
      muted: "#334155",
      line: "#cbd5e1",
      accent: "#0f172a",
      bodyBg:
        "radial-gradient(1000px 520px at 10% 10%, rgba(15,23,42,.10), rgba(255,255,255,0)), #f8fafc",
      pageBg: "#f8fafc",
      headerBg: "linear-gradient(180deg, rgba(15,23,42,.10), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      borderStyle: "dashed",
      radius: 18,
      shadow: "0 14px 40px rgba(15,23,42,.10)",
      hasChips: true,
    });
  }

  if (template === "corporate") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1324",
      muted: "#44546a",
      line: "#d6deea",
      accent: "#0b57d0",
      accent2: "#111827",
      bodyBg: "#f3f6fb",
      pageBg: "#f3f6fb",
      headerBg: "linear-gradient(135deg, rgba(11,87,208,.10), rgba(17,24,39,.04))",
      cardBg: "#ffffff",
      radius: 14,
      shadow: "0 16px 45px rgba(11,19,36,.10)",
      hasChips: true,
    });
  }

  if (template === "contrast") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#111827",
      line: "#0b0f18",
      accent: "#0b0f18",
      accent2: "#0b0f18",
      bodyBg: "#ffffff",
      pageBg: "#f7f7f7",
      headerBg: "linear-gradient(180deg, rgba(0,0,0,.08), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 0,
      shadow: "none",
      hasChips: true,
    });
  }

  if (template === "minimalist") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#6b7280",
      line: "#eef2f7",
      accent: "#111827",
      bodyBg: "#ffffff",
      pageBg: "#fbfbfc",
      headerBg: "linear-gradient(180deg, rgba(17,24,39,.04), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 24,
      shadow: "0 10px 30px rgba(17,24,39,.06)",
      hasChips: true,
    });
  }

  if (template === "grid") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1a2a",
      muted: "#2a4a6a",
      line: "#bfe3ff",
      accent: "#0b57d0",
      accent2: "#06b6d4",
      bodyBg:
        "linear-gradient(90deg, rgba(11,87,208,.05) 1px, rgba(255,255,255,0) 1px), linear-gradient(180deg, rgba(6,182,212,.05) 1px, rgba(255,255,255,0) 1px), #f7fbff",
      pageBg: "#f7fbff",
      headerBg: "linear-gradient(135deg, rgba(11,87,208,.12), rgba(6,182,212,.08))",
      cardBg: "rgba(255,255,255,.92)",
      borderStyle: "dashed",
      radius: 18,
      shadow: "0 18px 55px rgba(11,26,42,.10)",
      headerAfterGrid: true,
      hasChips: true,
    });
  }

  if (template === "retro") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1b12",
      muted: "#6b3f2a",
      line: "#f0d9c7",
      accent: "#f97316",
      accent2: "#f59e0b",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(249,115,22,.12), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(245,158,11,.10), rgba(255,255,255,0)), #fff7ed",
      pageBg: "#fff7ed",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.16), rgba(245,158,11,.10))",
      cardBg: "linear-gradient(180deg, rgba(249,115,22,.04), rgba(255,255,255,0))",
      radius: 18,
      shadow: "0 16px 45px rgba(43,27,18,.10)",
      hasChips: true,
    });
  }

  if (template === "pastel") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#e7e3ff",
      accent: "#a78bfa",
      accent2: "#60a5fa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(167,139,250,.18), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(96,165,250,.14), rgba(255,255,255,0)), #fbfaff",
      pageBg: "#fbfaff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.18), rgba(96,165,250,.12))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "aura") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#22c55e",
      accent2: "#06b6d4",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(34,197,94,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(6,182,212,.12), rgba(255,255,255,0)), #f7fbff",
      pageBg: "#effdf6",
      headerBg: "linear-gradient(135deg, rgba(34,197,94,.14), rgba(6,182,212,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.10)",
      hasChips: true,
    });
  }

  if (template === "lavender") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f1b2e",
      muted: "#5b4f78",
      line: "#e8defa",
      accent: "#7c3aed",
      accent2: "#a78bfa",
      bodyBg: "radial-gradient(900px 520px at 20% 10%, rgba(124,58,237,.14), rgba(255,255,255,0)), #fbf8ff",
      pageBg: "#fbf8ff",
      headerBg: "linear-gradient(180deg, rgba(167,139,250,.22), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 48px rgba(31,27,46,.10)",
      hasChips: true,
    });
  }

  if (template === "sunset") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd3d8",
      accent: "#fb7185",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 25% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(249,115,22,.12), rgba(255,255,255,0)), #fff6f7",
      pageBg: "#fff6f7",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(249,115,22,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "forest") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1f17",
      muted: "#2a5a44",
      line: "#cfe8dc",
      accent: "#16a34a",
      accent2: "#0ea5e9",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(22,163,74,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(14,165,233,.08), rgba(255,255,255,0)), #f3fbf7",
      pageBg: "#f3fbf7",
      headerBg: "linear-gradient(135deg, rgba(22,163,74,.16), rgba(14,165,233,.08))",
      cardBg: "#ffffff",
      radius: 16,
      shadow: "0 18px 55px rgba(11,31,23,.10)",
      hasChips: true,
    });
  }

  if (template === "ocean") {
    return mkThemeCss({
      font: "sans",
      ink: "#061a2a",
      muted: "#21506f",
      line: "#cfe7ff",
      accent: "#0ea5e9",
      accent2: "#06b6d4",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(14,165,233,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(6,182,212,.12), rgba(255,255,255,0)), #f4fbff",
      pageBg: "#f4fbff",
      headerBg: "linear-gradient(135deg, rgba(14,165,233,.16), rgba(6,182,212,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(6,26,42,.10)",
      hasChips: true,
    });
  }

  if (template === "sand") {
    return mkThemeCss({
      font: "serif",
      ink: "#2b2012",
      muted: "#6b5a2a",
      line: "#f1e2c7",
      accent: "#d97706",
      accent2: "#f59e0b",
      bodyBg: "radial-gradient(900px 520px at 20% 10%, rgba(217,119,6,.14), rgba(255,255,255,0)), #fffbf2",
      pageBg: "#fffbf2",
      headerBg: "linear-gradient(180deg, rgba(245,158,11,.16), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      radius: 14,
      shadow: "0 14px 40px rgba(43,32,18,.08)",
      hasChips: true,
    });
  }

  if (template === "royal") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#1d4ed8",
      accent2: "#7c3aed",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(29,78,216,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(124,58,237,.12), rgba(255,255,255,0)), #f7f9ff",
      pageBg: "#f2f0ff",
      headerBg: "linear-gradient(135deg, rgba(29,78,216,.16), rgba(124,58,237,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.12)",
      hasChips: true,
    });
  }

  if (template === "gold") {
    return mkThemeCss({
      font: "serif",
      ink: "#1a1410",
      muted: "#5b4b3a",
      line: "#f2e6c9",
      accent: "#b45309",
      accent2: "#f59e0b",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(245,158,11,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(180,83,9,.10), rgba(255,255,255,0)), #fffaf0",
      pageBg: "#fff6e6",
      headerBg: "linear-gradient(135deg, rgba(245,158,11,.18), rgba(180,83,9,.10))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 18,
      shadow: "0 18px 55px rgba(26,20,16,.10)",
      hasChips: true,
    });
  }
  // ---------- FUN / BRIGHT THEMES (NEW x25) ----------
  if (template === "bubblegum") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd1dc",
      accent: "#ff3ea5",
      accent2: "#8b5cf6",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(255,62,165,.18), rgba(255,255,255,0)), #fff5fb",
      pageBg: "#fff5fb",
      headerBg: "linear-gradient(135deg, rgba(255,62,165,.20), rgba(139,92,246,.12))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "limepop") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1f17",
      muted: "#255c45",
      line: "#c9f7d6",
      accent: "#22c55e",
      accent2: "#84cc16",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(34,197,94,.18), rgba(255,255,255,0)), #f3fff7",
      pageBg: "#f3fff7",
      headerBg: "linear-gradient(135deg, rgba(34,197,94,.18), rgba(132,204,22,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(11,31,23,.10)",
      hasChips: true,
    });
  }

  if (template === "citrus") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1b12",
      muted: "#6b3f2a",
      line: "#ffe4c7",
      accent: "#f97316",
      accent2: "#f59e0b",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(249,115,22,.18), rgba(255,255,255,0)), #fff8ed",
      pageBg: "#fff8ed",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.20), rgba(245,158,11,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,27,18,.10)",
      hasChips: true,
    });
  }

  if (template === "electric") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#00e5ff",
      accent2: "#7c3aed",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(0,229,255,.18), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(124,58,237,.12), rgba(255,255,255,0)), #f7fbff",
      pageBg: "#eef7ff",
      headerBg: "linear-gradient(135deg, rgba(0,229,255,.18), rgba(124,58,237,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.10)",
      hasChips: true,
    });
  }

  if (template === "confetti") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#4b5563",
      line: "#e5e7eb",
      accent: "#fb7185",
      accent2: "#60a5fa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(96,165,250,.14), rgba(255,255,255,0)), #fff7fb",
      pageBg: "#fff7fb",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(96,165,250,.12))",
      cardBg: "#ffffff",
      radius: 22,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }

  if (template === "rainbow") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#475569",
      line: "#e5e7eb",
      accent: "#ef4444",
      accent2: "#3b82f6",
      bodyBg:
        "radial-gradient(900px 520px at 15% 10%, rgba(239,68,68,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 50% 20%, rgba(34,197,94,.12), rgba(255,255,255,0)), radial-gradient(900px 520px at 85% 10%, rgba(59,130,246,.14), rgba(255,255,255,0)), #ffffff",
      pageBg: "#ffffff",
      headerBg:
        "linear-gradient(135deg, rgba(239,68,68,.16), rgba(245,158,11,.12), rgba(34,197,94,.10), rgba(59,130,246,.14), rgba(124,58,237,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }

  if (template === "sunny") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#fff2b3",
      accent: "#facc15",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(250,204,21,.18), rgba(255,255,255,0)), #fffdf0",
      pageBg: "#fffdf0",
      headerBg: "linear-gradient(135deg, rgba(250,204,21,.18), rgba(249,115,22,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "watermelon") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd3d8",
      accent: "#fb7185",
      accent2: "#22c55e",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(34,197,94,.10), rgba(255,255,255,0)), #fff6f7",
      pageBg: "#fff6f7",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(34,197,94,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "grape") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f1b2e",
      muted: "#5b4f78",
      line: "#e8defa",
      accent: "#7c3aed",
      accent2: "#a78bfa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(124,58,237,.14), rgba(255,255,255,0)), #fbf8ff",
      pageBg: "#fbf8ff",
      headerBg: "linear-gradient(135deg, rgba(124,58,237,.18), rgba(167,139,250,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 48px rgba(31,27,46,.10)",
      hasChips: true,
    });
  }

  if (template === "tropical") {
    return mkThemeCss({
      font: "sans",
      ink: "#061a2a",
      muted: "#21506f",
      line: "#cfe7ff",
      accent: "#06b6d4",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(6,182,212,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(251,113,133,.12), rgba(255,255,255,0)), #f4fbff",
      pageBg: "#f4fbff",
      headerBg: "linear-gradient(135deg, rgba(6,182,212,.16), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(6,26,42,.10)",
      hasChips: true,
    });
  }

  if (template === "mint") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1324",
      muted: "#44546a",
      line: "#c6f6e6",
      accent: "#14b8a6",
      accent2: "#22c55e",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(20,184,166,.16), rgba(255,255,255,0)), #f0fffb",
      pageBg: "#f0fffb",
      headerBg: "linear-gradient(135deg, rgba(20,184,166,.18), rgba(34,197,94,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 45px rgba(11,19,36,.10)",
      hasChips: true,
    });
  }

  if (template === "sky") {
    return mkThemeCss({
      font: "sans",
      ink: "#061a2a",
      muted: "#21506f",
      line: "#cfe7ff",
      accent: "#3b82f6",
      accent2: "#0ea5e9",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(59,130,246,.16), rgba(255,255,255,0)), #f4fbff",
      pageBg: "#f4fbff",
      headerBg: "linear-gradient(135deg, rgba(59,130,246,.16), rgba(14,165,233,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(6,26,42,.10)",
      hasChips: true,
    });
  }

  if (template === "coral") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1b12",
      muted: "#6b3f2a",
      line: "#ffe4d6",
      accent: "#fb7185",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), #fff7f5",
      pageBg: "#fff7f5",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(249,115,22,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,27,18,.10)",
      hasChips: true,
    });
  }

  if (template === "flamingo") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd3ea",
      accent: "#ec4899",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(236,72,153,.18), rgba(255,255,255,0)), #fff5fb",
      pageBg: "#fff5fb",
      headerBg: "linear-gradient(135deg, rgba(236,72,153,.18), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "popart") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#111827",
      line: "#0b0f18",
      accent: "#f97316",
      accent2: "#3b82f6",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(249,115,22,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(59,130,246,.12), rgba(255,255,255,0)), #ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.16), rgba(59,130,246,.12))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 10,
      shadow: "0 12px 30px rgba(0,0,0,.08)",
      hasChips: true,
    });
  }

  if (template === "arcade2") {
    return mkThemeCss({
      font: "sans",
      ink: "#120a2a",
      muted: "#3b2a66",
      line: "#e7d7ff",
      accent: "#7c3aed",
      accent2: "#06b6d4",
      bodyBg:
        "radial-gradient(1200px 600px at 10% 10%, rgba(124,58,237,.14), rgba(255,255,255,0)), radial-gradient(1000px 600px at 90% 20%, rgba(6,182,212,.12), rgba(255,255,255,0)), #fbf7ff",
      pageBg: "#fbf7ff",
      headerBg: "linear-gradient(135deg, rgba(124,58,237,.18), rgba(6,182,212,.12))",
      cardBg: "linear-gradient(180deg, rgba(124,58,237,.05), rgba(255,255,255,0))",
      radius: 20,
      shadow: "0 16px 45px rgba(18,10,42,.12)",
      headerAfterGrid: true,
      hasChips: true,
    });
  }

  if (template === "hologram") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#22d3ee",
      accent2: "#a78bfa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(34,211,238,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(167,139,250,.14), rgba(255,255,255,0)), #f7fbff",
      pageBg: "#f2f6ff",
      headerBg: "linear-gradient(135deg, rgba(34,211,238,.16), rgba(167,139,250,.12))",
      cardBg: "rgba(255,255,255,.92)",
      borderStyle: "solid",
      radius: 22,
      shadow: "0 22px 70px rgba(11,16,32,.10)",
      hasChips: true,
    });
  }

  if (template === "galaxy") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dbeafe",
      accent: "#a78bfa",
      accent2: "#22d3ee",
      bodyBg:
        "radial-gradient(900px 520px at 25% 10%, rgba(167,139,250,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(34,211,238,.12), rgba(255,255,255,0)), #f7f9ff",
      pageBg: "#f4f4ff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.18), rgba(34,211,238,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.12)",
      hasChips: true,
    });
  }

  if (template === "synthwave") {
    return mkThemeCss({
      font: "sans",
      ink: "#140a2a",
      muted: "#3b2a66",
      line: "#f5d0fe",
      accent: "#ff00e5",
      accent2: "#00e5ff",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(255,0,229,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(0,229,255,.12), rgba(255,255,255,0)), #fff5ff",
      pageBg: "#fff5ff",
      headerBg: "linear-gradient(135deg, rgba(255,0,229,.18), rgba(0,229,255,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(20,10,42,.12)",
      hasChips: true,
    });
  }

  if (template === "lava") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b120f",
      muted: "#6b2a24",
      line: "#ffd1c7",
      accent: "#ef4444",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(239,68,68,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(249,115,22,.12), rgba(255,255,255,0)), #fff6f5",
      pageBg: "#fff6f5",
      headerBg: "linear-gradient(135deg, rgba(239,68,68,.16), rgba(249,115,22,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,18,15,.10)",
      hasChips: true,
    });
  }

  if (template === "lemonade") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#fff2b3",
      accent: "#facc15",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(250,204,21,.18), rgba(255,255,255,0)), #fffdf0",
      pageBg: "#fffdf0",
      headerBg: "linear-gradient(135deg, rgba(250,204,21,.18), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "cottoncandy") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#ffd7f5",
      accent: "#a78bfa",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(167,139,250,.18), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(251,113,133,.14), rgba(255,255,255,0)), #fff7fd",
      pageBg: "#fff7fd",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.18), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 22,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "sprinkles") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#4b5563",
      line: "#e5e7eb",
      accent: "#60a5fa",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 15% 10%, rgba(96,165,250,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 50% 15%, rgba(34,197,94,.12), rgba(255,255,255,0)), radial-gradient(900px 520px at 85% 10%, rgba(249,115,22,.14), rgba(255,255,255,0)), #fff",
      pageBg: "#ffffff",
      headerBg:
        "linear-gradient(135deg, rgba(96,165,250,.16), rgba(34,197,94,.12), rgba(249,115,22,.12))",
      cardBg: "#ffffff",
      radius: 22,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }

  if (template === "comic") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#111827",
      line: "#0b0f18",
      accent: "#facc15",
      accent2: "#3b82f6",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(250,204,21,.20), rgba(59,130,246,.12))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 10,
      shadow: "0 12px 30px rgba(0,0,0,.10)",
      hasChips: true,
    });
  }

  if (template === "playground") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#475569",
      line: "#e5e7eb",
      accent: "#3b82f6",
      accent2: "#ef4444",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(59,130,246,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(239,68,68,.12), rgba(255,255,255,0)), #ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(59,130,246,.16), rgba(239,68,68,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }
  return templateStyles("classic");
}

/**
 * Cover letter wrapper
 */
function templateStylesCover(template: ResumeTemplateId) {
  const letterCardBg = `var(--cardbg, var(--pagebg, #fff))`;

  return `
${templateStyles(template)}

/* ---- Cover letter additions (MATCH ResumeMvp) ---- */
.cover-wrap { margin-top: 14px; }

.letter-card{
  border: 1px var(--borderstyle, solid) var(--line, #e7e7e7);
  border-radius: calc(var(--radius, 16px) - 2px);
  padding: 18px;
  background: ${letterCardBg};
  box-shadow: none;
}

.letter { font-size: 13px; line-height: 1.65; }
.letter .p { margin: 0 0 12px 0; white-space: pre-wrap; }

.sig { margin-top: 16px; }

/* ✅ Print/PDF parity — keep theme backgrounds (do not force white) */
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body{
    background: var(--bodybg) !important;
  }
  body{
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page{
    background: var(--pagebg) !important;
    box-shadow: none !important;
    margin: 0 !important;
  }
  .top:after{ display:none !important; }
  .letter-card{
    background: ${letterCardBg} !important;
  }
}
`.trim();
}

function splitParagraphs(text: string) {
  const raw = String(text || "").replace(/\r\n/g, "\n");
  const paras = raw
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.length ? paras : raw.trim() ? [raw.trim()] : [];
}

/**
 * Removes the old boilerplate header block that the API sometimes injects:
 * Your Name / Your Address / City, State, Zip / Your Email / Your Phone Number / Date
 */
function stripLegacyHeaderBlock(text: string) {
  if (!text) return "";

  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const isLegacyLine = (l: string) => {
    const s = l.trim().toLowerCase();
    return (
      s === "your name" ||
      s === "your address" ||
      s === "city, state, zip" ||
      s === "your email" ||
      s === "your phone number" ||
      s === "date"
    );
  };

  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;

  const start = i;
  while (i < lines.length && isLegacyLine(lines[i])) i++;

  if (i > start) {
    while (i < lines.length && !lines[i].trim()) i++;
    return lines.slice(i).join("\n");
  }

  return text;
}

function buildCoverLetterHtml(args: {
  template: ResumeTemplateId;
  profile: ResumeProfile;
  bodyText: string;
  includeSignature: boolean;
  signatureName: string;
  signatureClosing: string;
}) {
  const safe = (s: string) => escapeHtml(s || "");
  const {
    template,
    profile,
    bodyText,
    includeSignature,
    signatureClosing,
    signatureName,
  } = args;

  const contactBits = [
    profile.email?.trim() ? safe(profile.email) : "",
    profile.phone?.trim() ? safe(profile.phone) : "",
    profile.linkedin?.trim() ? safe(profile.linkedin) : "",
  ].filter(Boolean);

  const useChips = template !== "terminal" && template !== "ats" && template !== "compact";

  const topContact = useChips
    ? contactBits.map((c) => `<div class="chip">${c}</div>`).join("")
    : contactBits.map((c) => `<div>${c}</div>`).join("<br/>");

  const paras = splitParagraphs(bodyText);
  const parasHtml = paras.map((p) => `<div class="p">${safe(p)}</div>`).join("");

  const sigClosing = signatureClosing.trim() ? safe(signatureClosing.trim()) : "";
  const sigName = signatureName.trim() ? safe(signatureName.trim()) : "";

  const signatureHtml =
    includeSignature && (sigClosing || sigName)
      ? `<div class="sig">
          ${sigClosing ? `${sigClosing}<br/>` : ""}
          ${sigName}
        </div>`
      : "";

  if (template === "sidebar") {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cover Letter - ${safe(profile.fullName || "Updated")}</title>
  <style>${templateStylesCover(template)}</style>
</head>
<body>
  <div class="page">
    <div class="side">
      <h1 class="name">${safe(profile.fullName || "")}</h1>
      <div class="title">Cover Letter</div>
      <div class="contact">
        ${[
          profile.locationLine?.trim() ? safe(profile.locationLine) : "",
          profile.email?.trim() ? safe(profile.email) : "",
          profile.phone?.trim() ? safe(profile.phone) : "",
          profile.linkedin?.trim() ? safe(profile.linkedin) : "",
        ]
          .filter(Boolean)
          .map((c) => `<div>${c}</div>`)
          .join("")}
      </div>
    </div>

    <div class="main">
      <div class="cover-wrap">
        <div class="letter-card">
          <div class="letter">
            ${parasHtml || `<div class="p">No cover letter text yet.</div>`}
            ${signatureHtml}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cover Letter - ${safe(profile.fullName || "Updated")}</title>
  <style>${templateStylesCover(template)}</style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div>
        <h1 class="name">${safe(profile.fullName || "Your Name")}</h1>
        <div class="title">Cover Letter</div>
      </div>
      <div class="contact">
        ${topContact}
      </div>
    </div>

    <div class="content">
      <div class="cover-wrap">
        <div class="letter-card">
          <div class="letter">
            ${parasHtml || `<div class="p">No cover letter text yet.</div>`}
            ${signatureHtml}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function HtmlDocPreview({ html, footer }: { html: string; footer?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-black/80 dark:text-black/85">
          Document Preview (HTML)
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black/20">
        <iframe
          title="cover-letter-preview"
          className="h-[820px] w-full"
          sandbox="allow-same-origin"
          srcDoc={html || "<!doctype html><html><body></body></html>"}
        />
      </div>

      {footer ? <div className="mt-3 flex flex-wrap items-center gap-2">{footer}</div> : null}
    </div>
  );
}

/** ---------------- Tone recommendation ---------------- */

function recommendToneHeuristic(jobText: string) {
  const t = String(jobText || "").toLowerCase();

  const startupSignals = ["startup", "0-1", "zero-to-one", "fast-paced", "scrappy", "wear multiple hats"];
  const enterpriseSignals = ["enterprise", "stakeholders", "cross-functional", "governance", "compliance", "risk"];
  const leadershipSignals = ["lead", "manager", "mentored", "managed", "owned", "strategy", "roadmap"];
  const technicalSignals = ["api", "automation", "ci/cd", "pipeline", "performance", "observability", "kpi", "metrics"];

  const score = (arr: string[]) => arr.reduce((n, s) => (t.includes(s) ? n + 1 : n), 0);

  const sStartup = score(startupSignals);
  const sEnterprise = score(enterpriseSignals);
  const sLead = score(leadershipSignals);
  const sTech = score(technicalSignals);

  if (sStartup >= 2 && sTech >= 1) return "confident, scrappy, technically fluent, execution-focused";
  if (sEnterprise >= 2 && sLead >= 1) return "professional, structured, stakeholder-friendly, risk-aware";
  if (sTech >= 2) return "confident, concise, technically precise, impact-driven";
  if (sLead >= 2) return "confident, leadership-forward, concise, outcomes-first";
  return "confident, concise, impact-driven";
}

async function tryRecommendToneViaApi(jobText: string): Promise<string | null> {
  try {
    const res = await fetch("/api/recommend-tone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobText }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as any;
    const tone = String(data?.tone ?? "").trim();

    return tone || null;
  } catch {
    return null;
  }
}

/** ---------------- Component ---------------- */

export default function CoverLetterGenerator() {
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [applyPackBundle, setApplyPackBundle] = useState<ApplyPackBundle | null>(null);

  const isApplyPackFlow = useMemo(() => {
    const queryBundle = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("bundle") : "";
    return String(queryBundle || applyPackBundle?.bundle || "").trim() === "apply-pack";
  }, [applyPackBundle]);
  const [jobTextOverrideMode, setJobTextOverrideMode] = useState(false);
  const trackedCoverLetterEntryRef = useRef("");
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();

  const [profile, setProfile] = useState<ResumeProfile>({
    fullName: "",
    locationLine: "",
    email: "",
    phone: "",
    linkedin: "",
  });

  const [tone, setTone] = useState("confident, concise, impact-driven");
  const [length, setLength] = useState<"short" | "standard" | "detailed">("standard");
  const [includeBullets, setIncludeBullets] = useState(true);

  const [template, setTemplate] = useState<ResumeTemplateId>("modern");

  const [includeSignature, setIncludeSignature] = useState(true);
  const [signatureClosing, setSignatureClosing] = useState("");
  const [signatureName, setSignatureName] = useState("");

  const [loading, setLoading] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [coverLetterDraft, setCoverLetterDraft] = useState("");

  const applyPackActive = !!applyPackBundle?.job?.jobContextText;

  const canGenerate = useMemo(() => {
    const hasResume = !!file || resumeText.trim().length > 0;
    const hasJob = jobText.trim().length > 0;
    return hasResume && hasJob;
  }, [file, resumeText, jobText]);


  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function hydrateApplyPack() {
      const queryJobId = String(searchParams.get("jobId") || "").trim();
      const queryResumeProfileId = String(searchParams.get("resumeProfileId") || "").trim();
      const queryBundle = String(searchParams.get("bundle") || "").trim();

      let parsed: ApplyPackBundle | null = null;

      try {
        const raw = window.sessionStorage.getItem("gitajob.applyPack");
        if (raw) {
          parsed = JSON.parse(raw) as ApplyPackBundle;
        }
      } catch {
        parsed = null;
      }

      const storedJobId = String(parsed?.jobId || "").trim();
      const storedJobText = String(parsed?.job?.jobContextText || "").trim();

      const needsFreshJobContext =
        queryBundle === "apply-pack" &&
        queryJobId &&
        (queryJobId !== storedJobId || !storedJobText);

      if (needsFreshJobContext) {
        try {
          const response = await fetch(`/api/jobs/${encodeURIComponent(queryJobId)}/context`, {
            method: "GET",
            cache: "no-store",
          });
          const json = (await response.json().catch(() => null)) as
            | { ok?: boolean; item?: ApplyPackBundle["job"]; error?: string }
            | null;

          if (response.ok && json?.ok && json.item) {
            const nextBundle: ApplyPackBundle = {
              bundle: "apply-pack",
              jobId: queryJobId,
              resumeProfileId:
                queryResumeProfileId || String(parsed?.resumeProfileId || "").trim() || undefined,
              createdAt: new Date().toISOString(),
              nextStep: parsed?.nextStep || "cover-letter",
              bundleSessionId:
                String(parsed?.bundleSessionId || "").trim() ||
                `applypack_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
              sourceSlug: String(parsed?.sourceSlug || "").trim() || undefined,
              job: json.item,
            };

            window.sessionStorage.setItem("gitajob.applyPack", JSON.stringify(nextBundle));

            if (cancelled) return;

            setApplyPackBundle(nextBundle);
            setJobText(String(json.item.jobContextText || "").trim());
            setJobTextOverrideMode(false);
            return;
          }
        } catch {
          // fall through to stored bundle
        }
      }

      if (!parsed || parsed.bundle !== "apply-pack" || cancelled) return;

      setApplyPackBundle(parsed);

      const sameRequestedJob = !queryJobId || queryJobId === storedJobId;
      if (sameRequestedJob && storedJobText) {
        setJobText((current) => (current.trim() ? current : storedJobText));
      }
    }

    hydrateApplyPack();

    return () => {
      cancelled = true;
    };
  }, [searchParamsKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const queryJobId = searchParams.get("jobId") || "";
    const queryResumeProfileId = searchParams.get("resumeProfileId") || "";
    const bundle = searchParams.get("bundle") || "";

    const storedJobId = String(applyPackBundle?.jobId || "").trim();
    const storedResumeProfileId = String(applyPackBundle?.resumeProfileId || "").trim();
    const activeJobId = queryJobId || storedJobId;
    const activeResumeProfileId = queryResumeProfileId || storedResumeProfileId;
    const activeTitle = String(applyPackBundle?.job?.title || "").trim();
    const activeCompany = String(applyPackBundle?.job?.company || "").trim();

    if (!activeJobId) return;

    const entryKey = JSON.stringify({
      activeJobId,
      activeResumeProfileId,
      bundle,
      activeTitle,
      activeCompany,
    });

    if (trackedCoverLetterEntryRef.current === entryKey) return;
    trackedCoverLetterEntryRef.current = entryKey;

    trackJobEvent({
      event: "job_context_cover_letter_entry",
      jobId: activeJobId,
      resumeProfileId: activeResumeProfileId || undefined,
      company: activeCompany || undefined,
      jobTitle: activeTitle || undefined,
      route: "/cover-letter",
      mode: bundle === "apply-pack" ? "apply_pack" : "cover_letter",
      meta: {
        hasBundlePayload: !!applyPackBundle,
      },
    });
  }, [applyPackBundle, searchParamsKey]);

  function syncJobTextFromApplyPack() {
    const savedJobText = String(applyPackBundle?.job?.jobContextText || "").trim();
    if (savedJobText) setJobText(savedJobText);
    setJobTextOverrideMode(false);
  }

  function clearFile() {
    setFile(null);
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setCoverLetterDraft("");

    try {
      let res: Response;

      const MAX_CHARS = 120_000;

      const clamp = (s: string) =>
        String(s || "")
          .replace(/\r\n/g, "\n")
          .replace(/[ \t]+\n/g, "\n")
          .trim()
          .slice(0, MAX_CHARS);

      const safeResumeText = clamp(resumeText);
      const safeJobText = clamp(jobText);

      if (resumeText && safeResumeText.length < resumeText.trim().length) {
        setError("Resume text was very large — truncated for upload safety.");
      }
      if (jobText && safeJobText.length < jobText.trim().length) {
        setError("Job text was very large — truncated for upload safety.");
      }

      const analyticsJobId =
        (typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("jobId")
          : "") ||
        String(applyPackBundle?.jobId || "").trim();

      const analyticsResumeProfileId =
        (typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("resumeProfileId")
          : "") ||
        String(applyPackBundle?.resumeProfileId || "").trim();

      const analyticsSourceSlug = String(applyPackBundle?.sourceSlug || "").trim();

      const analyticsMode =
        String(
          (typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("bundle")
            : "") || applyPackBundle?.bundle || ""
        ).trim() === "apply-pack"
          ? "apply_pack"
          : "cover_letter";

      if (analyticsJobId) {
        trackJobEvent({
          event: "job_cover_letter_started",
          jobId: analyticsJobId,
          resumeProfileId: analyticsResumeProfileId || undefined,
          company: String(applyPackBundle?.job?.company || "").trim() || undefined,
          jobTitle: String(applyPackBundle?.job?.title || "").trim() || undefined,
          route: "/cover-letter",
          mode: analyticsMode,
          meta: {
            hasResumeFile: !!file,
            hasResumeText: !!safeResumeText.trim(),
            hasJobText: !!safeJobText.trim(),
          },
        });
      }

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("jobText", safeJobText);
        if (safeResumeText) fd.append("resumeText", safeResumeText);

        fd.append("fullName", profile.fullName);
        fd.append("locationLine", profile.locationLine);
        fd.append("email", profile.email);
        fd.append("phone", profile.phone);
        fd.append("linkedin", profile.linkedin);

        fd.append("tone", tone.trim());
        fd.append("length", length);
        fd.append("includeBullets", String(includeBullets));
        if (analyticsJobId) fd.append("jobId", analyticsJobId);
        if (analyticsResumeProfileId) fd.append("resumeProfileId", analyticsResumeProfileId);
        if (analyticsSourceSlug) fd.append("sourceSlug", analyticsSourceSlug);
        if (applyPackBundle?.job?.company) fd.append("company", String(applyPackBundle.job.company));
        if (applyPackBundle?.job?.title) fd.append("jobTitle", String(applyPackBundle.job.title));
        fd.append("mode", analyticsMode);
        if (applyPackBundle?.bundleSessionId) fd.append("bundleSessionId", String(applyPackBundle.bundleSessionId));

        res = await fetch("/api/cover-letter", { method: "POST", body: fd });
      } else {
        const body = {
          resumeText: safeResumeText,
          jobText: safeJobText,
          jobId: analyticsJobId || undefined,
          resumeProfileId: analyticsResumeProfileId || undefined,
          sourceSlug: analyticsSourceSlug || undefined,
          company: String(applyPackBundle?.job?.company || "").trim() || undefined,
          jobTitle: String(applyPackBundle?.job?.title || "").trim() || undefined,
          mode: analyticsMode,
          bundleSessionId: String(applyPackBundle?.bundleSessionId || "").trim() || undefined,

          fullName: profile.fullName,
          locationLine: profile.locationLine,
          email: profile.email,
          phone: profile.phone,
          linkedin: profile.linkedin,

          tone: tone.trim(),
          length,
          includeBullets,
        };

        res = await fetch("/api/cover-letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text();

      if (!res.ok) {
        throw new Error(raw || `Cover letter generation failed (${res.status})`);
      }

      let payload: ApiResp;
      if (contentType.includes("application/json")) {
        try {
          payload = JSON.parse(raw) as ApiResp;
        } catch {
          throw new Error(`Cover letter route returned invalid JSON: ${raw.slice(0, 200)}`);
        }
      } else {
        throw new Error(`Cover letter route returned non-JSON (${contentType}): ${raw.slice(0, 200)}`);
      }

      if (!payload.ok) {
        throw new Error((payload as any)?.error || "Cover letter generation failed");
      }

      const rawText = payload.coverLetter?.trim();
      if (!rawText) throw new Error("Empty cover letter returned");

      const cleanedText = stripLegacyHeaderBlock(rawText);

      setCoverLetterDraft(cleanedText);
    } catch (e: any) {
      setError(e?.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecommendTone() {
    setToneLoading(true);
    setError(null);

    try {
      if (!jobText.trim()) {
        setTone(recommendToneHeuristic(""));
        return;
      }

      const apiTone = await tryRecommendToneViaApi(jobText);

      if (apiTone) setTone(apiTone);
      else setTone(recommendToneHeuristic(jobText));
    } catch (e: any) {
      setError(e?.message || "Could not recommend tone");
    } finally {
      setToneLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!coverLetterDraft) return;
    try {
      await navigator.clipboard.writeText(coverLetterDraft);
    } catch {
      setError("Copy failed (browser blocked clipboard).");
    }
  }

  const coverLetterHtml = useMemo(() => {
    if (!coverLetterDraft.trim()) return "";
    return buildCoverLetterHtml({
      template,
      profile,
      bodyText: coverLetterDraft,
      includeSignature,
      signatureClosing,
      signatureName: signatureName.trim() ? signatureName : profile.fullName,
    });
  }, [coverLetterDraft, template, profile, includeSignature, signatureClosing, signatureName]);

  const templateLabel = TEMPLATE_OPTIONS.find((t) => t.id === template)?.label ?? template;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-black dark:text-black">
      {error ? (
        <div className="mb-4">
          <Callout title="Error" tone="danger">
            <div className="whitespace-pre-wrap text-sm">{error}</div>
          </Callout>
        </div>
      ) : null}


      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inputs */}
        <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <h2 className="text-base font-extrabold text-black dark:text-black">Inputs</h2>

          <div className="mt-3 grid gap-3">
            {/* File input */}
            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/90 dark:text-black/90">
                {applyPackActive ? "Resume file (recommended)" : "Resume file (optional)"}
              </div>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;

                  if (f && f.size > 3.5 * 1024 * 1024) {
                    setError("File too large. Please upload a smaller file (under ~3.5MB) or paste text instead.");
                    e.target.value = "";
                    setFile(null);
                    return;
                  }

                  setError(null);
                  setFile(f);
                }}
                className="block w-full text-sm text-black dark:text-black
                file:mr-3 file:rounded-lg file:border file:border-emerald-700/40
                file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-extrabold file:text-black
                file:shadow-md hover:file:bg-emerald-700 hover:file:shadow-lg
                dark:file:border-emerald-300/30 dark:file:bg-emerald-500 dark:hover:file:bg-emerald-600"
              />

              {file ? (
                <div className="mt-1 flex items-center gap-2">
                  <div className="text-xs font-extrabold text-black/90 dark:text-black/90">{file.name}</div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="text-sm font-extrabold underline opacity-80 hover:opacity-100 text-black dark:text-black"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              <div className="text-xs text-black/60 dark:text-black/90">
                {applyPackActive
                ? "Your saved job is already loaded below. Upload a resume file for the cleanest job-aware cover letter, or paste resume text instead."
                : "If you upload a file, the generator extracts text server-side (PDF/DOCX/TXT)."}
              </div>
            </label>

                  {/* Resume text */}
          <label className="grid gap-1.5">
            <div className="text-xs font-extrabold text-black/90">
              {applyPackActive ? "Resume text (optional override)" : "Resume text (paste if not uploading)"}
            </div>

            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={applyPackActive ? 6 : 8}
              className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm text-black outline-none
                        placeholder:text-black/80 focus:border-black/20
                        dark:bg-white dark:text-black dark:placeholder:text-black/90"
            />
          </label>

            {/* Job text */}
            <label className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-extrabold text-black/90 dark:text-black/90">
                  {applyPackBundle?.job?.jobContextText ? "Job context (from AI Job Match)" : "Job posting text"}
                </div>

                {applyPackBundle?.job?.jobContextText ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setJobTextOverrideMode((v) => !v)}
                      className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] font-extrabold text-black/80 hover:bg-white dark:border-white/10 dark:bg-black/20 dark:text-white"
                    >
                      {jobTextOverrideMode ? "Using manual override" : "Override saved job text"}
                    </button>
                    <button
                      type="button"
                      onClick={syncJobTextFromApplyPack}
                      className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] font-extrabold text-black/80 hover:bg-white dark:border-white/10 dark:bg-black/20 dark:text-white"
                    >
                      Re-sync saved job
                    </button>
                  </div>
                ) : null}
              </div>

              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={8}
                placeholder={applyPackBundle?.job?.jobContextText ? "Saved job context loaded from AI Job Match" : "Paste job posting here"}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
              />

              <div className="text-xs text-black/70 dark:text-black/80">
                {applyPackBundle?.job?.jobContextText
                  ? jobTextOverrideMode
                    ? "You are editing a local override. Re-sync anytime to restore the saved AI Job Match job context."
                    : "This field was prefilled from the saved job you selected in AI Job Match. You can still override it if needed."
                  : "Paste a job posting manually, or launch this page from AI Job Match to prefill it automatically."}
              </div>
            </label>

            {/* Template selector */}
            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/90 dark:text-black/90">Template</div>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value as ResumeTemplateId)}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold outline-none dark:border-white/10 dark:bg-black/20 dark:text-black"
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-black/90 dark:text-black/90">Selected: {templateLabel}</div>
            </label>

            {/* Header details */}
            <div className="rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-2 text-xs font-extrabold text-black/90 dark:text-black/90">Header details</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={profile.fullName}
                  onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
                <input
                  value={profile.locationLine}
                  onChange={(e) => setProfile((p) => ({ ...p, locationLine: e.target.value }))}
                  placeholder="Location"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
                <input
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
                <input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
                <input
                  value={profile.linkedin}
                  onChange={(e) => setProfile((p) => ({ ...p, linkedin: e.target.value }))}
                  placeholder="LinkedIn"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20 sm:col-span-2"
                />
              </div>
            </div>

            {/* Tone / Length */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-black/90 dark:text-black/90">Tone</div>
                  <button
                    type="button"
                    onClick={handleRecommendTone}
                    disabled={!jobText.trim() || toneLoading}
                    className="rounded-lg border border-black/10 bg-emerald-500 px-2 py-1 text-xs font-extrabold text-black hover:bg-green/25 disabled:opacity-90 dark:border-black/20 dark:bg-green/60 dark:text-black dark:hover:bg-white/15"
                    title="Uses /api/recommend-tone if available; otherwise a heuristic."
                  >
                    {toneLoading ? "Recommending…" : "Recommended tone"}
                  </button>
                </div>
                <input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
              </label>

              <label className="grid gap-1.5">
                <div className="text-xs font-extrabold text-black/90 dark:text-black/90">Length</div>
                <select
                  value={length}
                  onChange={(e) => setLength(e.target.value as any)}
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold outline-none dark:border-white/10 dark:bg-black/20 dark:text-black"
                >
                  <option value="short">Short</option>
                  <option value="standard">Standard</option>
                  <option value="detailed">Detailed</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-black dark:text-black">
              <input
                type="checkbox"
                checked={includeBullets}
                onChange={(e) => setIncludeBullets(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-xs font-extrabold text-black/90 dark:text-black/90">
                Include 3 impact bullets
              </span>
            </label>

            {/* Signature */}
            <div className="rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-black/90 dark:text-black/90">Signature block</div>
                <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => setIncludeSignature(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Include
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={signatureClosing}
                  onChange={(e) => setSignatureClosing(e.target.value)}
                  placeholder='Closing (optional) e.g. "Sincerely,"'
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 disabled:opacity-80 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                  disabled={!includeSignature}
                />
                <input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Signature name (optional — defaults to Full name)"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 disabled:opacity-80 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                  disabled={!includeSignature}
                />
              </div>

              <div className="mt-2 text-xs text-black/90 dark:text-black/90">
                Leave “Closing” empty if your generated text already includes a sign-off (prevents duplicate “Sincerely”).
              </div>
            </div>

            {/* Generate */}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || loading}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-600 hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-90"
              >
                {loading ? "Generating…" : isApplyPackFlow ? "Generate Cover Letter (included in 8-credit pack)" : "Generate Cover Letter (5 credits)"}
              </button>

              <div className="ml-auto text-xs font-extrabold text-black/90 dark:text-black/90">
                Preview is live-editable after generation.
              </div>
            </div>
          </div>
        </section>

        {/* Output / Preview */}
        <section className="grid gap-3">
          <HtmlDocPreview
            html={coverLetterHtml}
            footer={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copyToClipboard}
                  disabled={!coverLetterDraft}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-90 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                >
                  Copy
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      openHtmlPreviewInNewWindow("Cover Letter Preview", coverLetterHtml || "");
                    } catch (e: any) {
                      setError(e?.message || "Preview failed");
                    }
                  }}
                  disabled={!coverLetterDraft}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-90 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                >
                  Preview
                </button>

                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black dark:border-white/10 dark:bg-black/20 dark:text-black">
                    .pdf
                  </div>

                  <button
                    type="button"
                    disabled={!coverLetterDraft}
                    onClick={async () => {
                      if (!coverLetterDraft) return;
                      try {
                        await downloadPdfFromHtml("cover-letter.pdf", coverLetterHtml || "");
                      } catch (e: any) {
                        setError(e?.message || "Download failed");
                      }
                    }}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-600 hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-90"
                  >
                    Download PDF (5 credits)
                  </button>
                </div>
              </div>
            }
          />

          {/* Live editor */}
          <div className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="mb-2 text-xs font-extrabold text-black/90 dark:text-black/90">
              Edit cover letter (live preview)
            </div>
            <textarea
              value={coverLetterDraft}
              onChange={(e) => setCoverLetterDraft(e.target.value)}
              rows={12}
              placeholder="Generate a cover letter, then edit it here…"
              className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm leading-relaxed outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
            />
          </div>
        </section>
      </div>
    </main>
  );
}