// src/lib/resumeTemplates.ts

export type ResumeTemplateId =
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
  | "gold";

export const TEMPLATE_OPTIONS: Array<{ id: ResumeTemplateId; label: string }> = [
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
];

function headerContactChipsCss() {
  return `
/* --- Arcade-style header contact chips (unified) --- */
.top .contact{
  margin-top: 12px !important;
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  gap: 10px !important;
  align-items: center !important;
  justify-content: flex-start !important;
  text-align: left !important;
  max-width: none !important;
  padding-left: 0 !important;
  margin-left: 0 !important;
}

.top .chip{
  display: inline-flex !important;
  align-items: center !important;
  max-width: 100% !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
`.trim();
}

function printLockCss() {
  // Media-invariant lock: same in iframe preview AND pdf render
  return `
html, body{
  margin:0;
  padding:0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ✅ Always lock "paper" geometry, not just print */
.page{
  width: 8.5in !important;
  min-height: 11in !important;
  max-width: none !important;
  margin: 0 auto !important;
}

/* ✅ Avoid browser-specific print inset surprises */
@page{
  size: Letter;
  margin: 0;
}
`.trim();
}

/**
 * IMPORTANT: Theme parity (Resume ⇄ Cover Letter)
 * - Use the SAME CSS variables naming as the cover letter generator (lowercase).
 * - Ensure .page uses --pagebg (not --bodybg), and print keeps both.
 */
type ThemeArgs = {
  font: "sans" | "serif" | "mono";
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2?: string;

  bodyBg: string; // body background
  pageBg: string; // page background
  headerBg: string;
  cardBg: string;

  radius: number;
  shadow: string;

  borderStyle?: "solid" | "dashed";
  headerAfterGrid?: boolean;
};

function mkThemeCss(t: ThemeArgs) {
  const borderStyle = t.borderStyle ?? "solid";
  const accent2 = t.accent2 ?? t.accent;

  const PAGE_SIZE = "Letter";
  const PAGE_MARGIN = "0.35in";

  const fontFamily =
    t.font === "serif"
      ? `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
      : t.font === "mono"
      ? `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
      : `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`;

  return `
:root{
  --ink:${t.ink};
  --muted:${t.muted};
  --line:${t.line};
  --accent:${t.accent};
  --accent2:${accent2};

  /* ✅ cover-letter parity variable names (lowercase) */
  --bodybg:${t.bodyBg};
  --pagebg:${t.pageBg};
  --headerbg:${t.headerBg};
  --cardbg:${t.cardBg};

  --radius:${t.radius}px;
  --shadow:${t.shadow};
  --borderstyle:${borderStyle};
}

*{ box-sizing:border-box; }

html, body{
  margin:0;
  padding:0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  height: 100%;
}

body{
  min-height: 100vh;
  padding: 18px;
  font-family: ${fontFamily};
  color: var(--ink);
  background: var(--bodybg);
  line-height: 1.35;
}

@page{
  size: ${PAGE_SIZE};
  margin: ${PAGE_MARGIN};
}

.page{
  width: 8.5in;
  min-height: 11in;
  margin: 0 auto;
  padding: 18px 22px;
  background: var(--pagebg);
  border-radius: var(--radius);
}

.top{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  padding: 14px 16px;
  border: 1px var(--borderstyle) var(--line);
  border-radius: var(--radius);
  background: var(--headerbg);
  box-shadow: var(--shadow);
}

.name{
  margin:0;
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: -0.2px;
}

.title{
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}

.chip{
  display:inline-block;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px var(--borderstyle) var(--line);
  background: var(--cardbg);
  box-shadow: 0 10px 25px rgba(2,6,23,.06);
}

.content{
  margin-top: 14px;
}

.section{
  margin-top: 14px;
}

.h{
  display:flex;
  align-items:center;
  gap:10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .14em;
  font-size: 12px;
  margin-bottom: 8px;
}

.bar{
  display:inline-block;
  width: 14px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
}

.summary{
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
}

.meta{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.box{
  border: 1px var(--borderstyle) var(--line);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--cardbg);
  box-shadow: var(--shadow);
}

.boxtitle{
  font-weight: 800;
  margin-bottom: 6px;
}

.small{
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

.job{
  margin-top: 12px;
}

.jobhead{
  display:flex;
  justify-content:space-between;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px var(--borderstyle) var(--line);
  margin-bottom: 8px;
}

.jobtitle{
  font-weight: 800;
}

.jobmeta{
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

ul{
  margin: 0;
  padding-left: 18px;
}

li{
  margin: 0 0 6px 0;
}

${t.headerAfterGrid ? `.top:after{content:"";display:block;height:10px;margin-top:10px;border-top:1px dashed var(--line);width:100%;}` : ""}

${headerContactChipsCss()}

@media print{
  body{
    background: var(--bodybg) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 0 !important;
  }
  .page{
    background: var(--pagebg) !important;
    box-shadow: none !important;
    margin: 0 auto !important;
  }
}
`.trim();
}

/**
 * ✅ Resume-specific wrapper
 * Fixes mismatch bug:
 * - DO NOT reference --bodyBg/--pageBg (camelCase)
 * - Use lowercase vars to match CoverLetterGenerator: --bodybg / --pagebg
 */
export function templateStylesResume(template: ResumeTemplateId) {
  return `
${templateStyles(template)}

/* ✅ Print/PDF parity — keep theme backgrounds (do not force white) */
@media print {
  html, body{
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body{
    background: var(--bodybg) !important;
    padding: 0 !important;
  }

  .page{
    background: var(--pagebg, var(--bodybg)) !important;
    box-shadow: none !important;
    margin: 0 auto !important;
    border-radius: 0 !important;
  }

  .top:after{ display:none !important; }
}
`.trim();
}

/**
 * ✅ Full templateStyles() (no recursion)
 * - Lowercase variables matching cover letter generator
 * - .page uses --pagebg
 */
export function templateStyles(template: ResumeTemplateId) {
  const classicCss = `
:root{
  --ink:#111;
  --muted:#444;
  --line:#e7e7e7;
  --accent:#111;
  --accent2:#111;

  --bodybg:#ffffff;
  --pagebg:#ffffff;
  --headerbg:#ffffff;
  --cardbg:#ffffff;

  --radius: 0px;
  --shadow: none;
  --borderstyle: solid;
}

*{ box-sizing:border-box; }

body{
  font-family: Calibri, Arial, Helvetica, sans-serif;
  color: var(--ink);
  margin: 0;
  padding: 18px;
  background: var(--bodybg);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  line-height: 1.35;
}

.page{
  width: 8.5in;
  min-height: 11in;
  margin: 0 auto;
  border: 1px solid var(--line);
  padding: 18px 22px;
  background: var(--pagebg);
  border-radius: var(--radius);
}

.top{
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
  background: var(--headerbg);
}

.name{
  font-size: 28px;
  font-weight: 900;
  margin: 0;
}

.title{
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 700;
}

.contact{
  font-size: 12px;
  color: var(--muted);
  text-align: right;
  display: grid;
  gap: 4px;
}

.h{
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 900;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: .06em;
}

.summary{
  color: var(--muted);
  line-height: 1.45;
  font-size: 13px;
}

.job{
  margin-top: 10px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.jobhead{
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.jobtitle{ font-weight: 900; }

.jobmeta{
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

ul{ margin: 6px 0 0 18px; padding: 0; }
li{ margin: 6px 0; line-height: 1.35; }

.meta{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.box{
  border: 1px solid var(--line);
  padding: 10px;
  background: var(--cardbg);
}

.boxtitle{
  font-weight: 900;
  font-size: 12px;
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.small{ font-size: 12px; color: var(--muted); }

${headerContactChipsCss()}
${printLockCss()}
`.trim();

  if (template === "modern") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.72)",
      line: "rgba(15,23,42,.14)",
      accent: "#2563eb",
      accent2: "#10b981",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(37,99,235,.06)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "minimal") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.14)",
      accent: "#111827",
      accent2: "#111827",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(17,24,39,.04)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 14,
      shadow: "0 14px 40px rgba(2,6,23,.06)",
      borderStyle: "solid",
    });
  }

  if (template === "executive") {
    return mkThemeCss({
      font: "serif",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.16)",
      accent: "#7c3aed",
      accent2: "#111827",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(124,58,237,.06)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 18,
      shadow: "0 22px 60px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }

  if (template === "compact") {
    return `
${classicCss}
.page { padding: 14px 18px; }
.name { font-size: 24px; }
li { margin: 4px 0; }
.job { margin-top: 8px; padding-top: 8px; }
${printLockCss()}
`.trim();
  }

  if (template === "serif") {
    return mkThemeCss({
      font: "serif",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.16)",
      accent: "#0f172a",
      accent2: "#0f172a",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(15,23,42,.04)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 18px 48px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "ats") {
    return `
${classicCss}
.page{ border: none; }
.top{ border-bottom: 1px solid #111; }
.chip{ border: none; background: transparent; box-shadow: none; padding: 0; }
.meta, .box{ border: none; padding: 0; background: transparent; }
.h{ color: #111; letter-spacing: 0; }
${printLockCss()}
`.trim();
  }

  if (template === "sidebar") {
    return `
:root{
  --ink:#0f172a;
  --muted: rgba(15,23,42,.72);
  --line: rgba(15,23,42,.14);
  --accent:#2563eb;
  --accent2:#10b981;

  --bodybg:#ffffff;
  --pagebg:#ffffff;
  --headerbg: rgba(37,99,235,.06);
  --cardbg: rgba(255,255,255,.92);

  --radius:16px;
  --shadow: 0 18px 50px rgba(2,6,23,.08);
  --borderstyle: solid;
}
body{
  margin:0;
  background: var(--bodybg);
  color:var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  padding: 18px;
}
.page{
  width: 8.5in; min-height: 11in; margin: 0 auto;
  padding: 18px 22px;
  display:grid;
  grid-template-columns: 2.7fr 5.3fr;
  gap: 16px;
  background: var(--pagebg);
  border-radius: var(--radius);
}
.side{
  border: 1px var(--borderstyle) solid var(--line);
  border-radius: 16px;
  padding: 14px 14px;
  background: var(--headerbg);
  box-shadow: var(--shadow);
}
.main{
  border: 1px var(--borderstyle) solid var(--line);
  border-radius: 16px;
  padding: 14px 16px;
  background: rgba(255,255,255,.95);
  box-shadow: 0 18px 50px rgba(2,6,23,.06);
}
.name{ margin:0; font-size: 26px; letter-spacing: -.2px; }
.title{ margin-top: 6px; color: var(--muted); font-size: 13px; font-weight: 700; }
.contact{ margin-top: 10px; display:grid; gap: 8px; }
.chip{
  display:inline-flex; align-items:center; gap:8px;
  border:1px var(--borderstyle) solid var(--line);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--cardbg);
}
.section{ margin-top: 12px; }
.h{
  font-weight: 800; text-transform: uppercase;
  letter-spacing: .14em; font-size: 12px; margin: 0 0 8px 0;
}
.summary{ font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.meta{ display:grid; grid-template-columns: 1fr; gap: 10px; }
.box{
  border:1px var(--borderstyle) solid var(--line);
  border-radius: 14px;
  padding: 10px;
  background: var(--cardbg);
  box-shadow: var(--shadow);
}
.boxtitle{ font-weight: 800; margin-bottom: 6px; }
.small{ font-size: 12px; color: var(--muted); line-height: 1.45; }
.job{ margin-top: 12px; }
.jobhead{
  display:flex; justify-content:space-between; gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px var(--borderstyle) solid var(--line);
  margin-bottom: 8px;
  flex-wrap:wrap;
}
.jobtitle{ font-weight: 800; }
.jobmeta{ color: var(--muted); font-size: 12px; white-space: nowrap; }
ul{ margin:0; padding-left: 18px; }
li{ margin: 0 0 6px 0; }
${headerContactChipsCss()}
${printLockCss()}

@media print{
  body{ padding: 0 !important; background: var(--bodybg) !important; }
  .page{ background: var(--pagebg) !important; }
}
`.trim();
  }

  if (template === "arcade") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.74)",
      line: "rgba(11,18,32,.18)",
      accent: "#a855f7",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(168,85,247,.10), rgba(34,197,94,.08))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 18,
      shadow: "0 22px 60px rgba(2,6,23,.10)",
      borderStyle: "dashed",
      headerAfterGrid: true,
    });
  }

  if (template === "neon") {
    return mkThemeCss({
      font: "sans",
      ink: "#e5e7eb",
      muted: "rgba(229,231,235,.78)",
      line: "rgba(229,231,235,.18)",
      accent: "#22d3ee",
      accent2: "#f472b6",
      bodyBg: "#05060a",
      pageBg: "#05060a",
      headerBg: "linear-gradient(135deg, rgba(34,211,238,.10), rgba(244,114,182,.10))",
      cardBg: "rgba(255,255,255,.06)",
      radius: 18,
      shadow: "0 22px 60px rgba(0,0,0,.40)",
      borderStyle: "solid",
    });
  }

  if (template === "terminal") {
    return mkThemeCss({
      font: "mono",
      ink: "#d1fae5",
      muted: "rgba(209,250,229,.76)",
      line: "rgba(209,250,229,.18)",
      accent: "#34d399",
      accent2: "#22c55e",
      bodyBg: "#06120b",
      pageBg: "#06120b",
      headerBg: "rgba(52,211,153,.07)",
      cardBg: "rgba(255,255,255,.04)",
      radius: 14,
      shadow: "0 22px 60px rgba(0,0,0,.20)",
      borderStyle: "solid",
    });
  }

  if (template === "blueprint") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.72)",
      line: "rgba(11,18,32,.16)",
      accent: "#2563eb",
      accent2: "#0ea5e9",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg:
        "repeating-linear-gradient(45deg, rgba(37,99,235,.05), rgba(37,99,235,.05) 8px, rgba(14,165,233,.04) 8px, rgba(14,165,233,.04) 16px)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 20px 55px rgba(2,6,23,.08)",
      borderStyle: "dashed",
    });
  }

  if (template === "monochrome") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.18)",
      accent: "#111827",
      accent2: "#374151",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(17,24,39,.04)",
      cardBg: "rgba(255,255,255,.94)",
      radius: 18,
      shadow: "0 18px 48px rgba(2,6,23,.08)",
    });
  }

  if (template === "noir") {
    return mkThemeCss({
      font: "serif",
      ink: "#f9fafb",
      muted: "rgba(249,250,251,.76)",
      line: "rgba(249,250,251,.16)",
      accent: "#fbbf24",
      accent2: "#f472b6",
      bodyBg: "#0a0a0b",
      pageBg: "#0a0a0b",
      headerBg: "linear-gradient(135deg, rgba(251,191,36,.10), rgba(244,114,182,.08))",
      cardBg: "rgba(255,255,255,.06)",
      radius: 18,
      shadow: "0 22px 60px rgba(0,0,0,.45)",
    });
  }

  if (template === "paper") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f2937",
      muted: "rgba(31,41,55,.70)",
      line: "rgba(31,41,55,.16)",
      accent: "#b45309",
      accent2: "#92400e",
      bodyBg: "#fff7ed",
      pageBg: "#fff7ed",
      headerBg: "rgba(180,83,9,.06)",
      cardBg: "rgba(255,255,255,.85)",
      radius: 18,
      shadow: "0 18px 50px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }

  if (template === "ink") {
    return mkThemeCss({
      font: "serif",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.72)",
      line: "rgba(15,23,42,.20)",
      accent: "#0f172a",
      accent2: "#0f172a",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(15,23,42,.03)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 18,
      shadow: "0 12px 36px rgba(2,6,23,.06)",
      borderStyle: "dashed",
    });
  }

  if (template === "corporate") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.72)",
      line: "rgba(15,23,42,.16)",
      accent: "#0ea5e9",
      accent2: "#2563eb",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(14,165,233,.06)",
      cardBg: "rgba(255,255,255,.94)",
      radius: 16,
      shadow: "0 18px 48px rgba(2,6,23,.08)",
    });
  }

  if (template === "contrast") {
    return mkThemeCss({
      font: "sans",
      ink: "#000000",
      muted: "rgba(0,0,0,.72)",
      line: "rgba(0,0,0,.22)",
      accent: "#000000",
      accent2: "#111827",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(0,0,0,.04)",
      cardBg: "rgba(255,255,255,.96)",
      radius: 14,
      shadow: "0 10px 28px rgba(2,6,23,.08)",
    });
  }

  if (template === "minimalist") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.12)",
      accent: "#22c55e",
      accent2: "#16a34a",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(34,197,94,.06)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 22,
      shadow: "0 16px 44px rgba(2,6,23,.06)",
    });
  }

  if (template === "grid") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.72)",
      line: "rgba(37,99,235,.20)",
      accent: "#2563eb",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg:
        "linear-gradient(135deg, rgba(37,99,235,.07), rgba(34,197,94,.05)), repeating-linear-gradient(0deg, rgba(37,99,235,.06), rgba(37,99,235,.06) 1px, transparent 1px, transparent 16px), repeating-linear-gradient(90deg, rgba(37,99,235,.06), rgba(37,99,235,.06) 1px, transparent 1px, transparent 16px)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 18px 52px rgba(2,6,23,.08)",
      borderStyle: "dashed",
    });
  }

  if (template === "retro") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "rgba(31,41,55,.72)",
      line: "rgba(31,41,55,.16)",
      accent: "#f97316",
      accent2: "#f59e0b",
      bodyBg: "#fff7ed",
      pageBg: "#fff7ed",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.10), rgba(245,158,11,.10))",
      cardBg: "rgba(255,255,255,.86)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }

  if (template === "pastel") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.12)",
      accent: "#a78bfa",
      accent2: "#34d399",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.14), rgba(52,211,153,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "aura") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#10b981",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(16,185,129,.14), rgba(34,197,94,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "lavender") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.70)",
      line: "rgba(15,23,42,.14)",
      accent: "#a78bfa",
      accent2: "#7c3aed",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.16), rgba(124,58,237,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "sunset") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.14)",
      accent: "#fb7185",
      accent2: "#f59e0b",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.14), rgba(245,158,11,.12))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "forest") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#16a34a",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(22,163,74,.14), rgba(34,197,94,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "ocean") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#0ea5e9",
      accent2: "#2563eb",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(14,165,233,.14), rgba(37,99,235,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "sand") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f2937",
      muted: "rgba(31,41,55,.70)",
      line: "rgba(31,41,55,.16)",
      accent: "#d97706",
      accent2: "#b45309",
      bodyBg: "#fffbeb",
      pageBg: "#fffbeb",
      headerBg: "linear-gradient(135deg, rgba(217,119,6,.12), rgba(180,83,9,.08))",
      cardBg: "rgba(255,255,255,.86)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.10)",
    });
  }

  if (template === "royal") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#2563eb",
      accent2: "#7c3aed",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(37,99,235,.14), rgba(124,58,237,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "gold") {
    return mkThemeCss({
      font: "serif",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.16)",
      accent: "#f59e0b",
      accent2: "#fbbf24",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(245,158,11,.12), rgba(251,191,36,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 22px 60px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }

  if (template === "classic") return classicCss;

  return classicCss;
}
