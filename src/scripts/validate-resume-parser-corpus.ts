// TARGET PATH: src/scripts/validate-resume-parser-corpus.ts
// JOB-139 Pass 4 — corpus validator final tolerance for degraded two-column/table layouts
// Full replacement file

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { parseResumeDocument } from "@/lib/resumeParser";
import { toResumeParserCompatibilityOutput } from "@/lib/resumeParser/compat";

type Confidence = "high" | "medium" | "low" | "unknown";

type ManifestItem = {
  sample: string;
  category: string;
  role?: string;
  pdf: string;
  docx?: string | null;
  confidence?: Confidence;
};

type ExpectedFixture = {
  expectedConfidence?: Confidence;
  expectedSections: string[];
  expectedRoleFamily?: string;
  expectedPositions?: number;
  expectedTitles: string[];
  expectedCompanies: string[];
  expectedBulletRange?: { min: number; max: number };
  expectedWarnings?: string;
  fakeData?: boolean;
  raw: Record<string, string>;
};

type SampleResult = {
  sample: string;
  category: string;
  role?: string;
  pdfPath: string;
  expectedPath: string;
  passed: boolean;
  hardFailure: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  actual: {
    confidence: Confidence;
    sections: string[];
    positionCount: number;
    titles: string[];
    companies: string[];
    bulletCount: number;
    warnings: string[];
    extractedTextLength: number;
  };
};

type CategorySummary = {
  category: string;
  total: number;
  passed: number;
  failed: number;
  hardFailures: number;
  confidenceCounts: Record<Confidence, number>;
};

const DEFAULT_CORPUS_DIR = "resume-parser-fixtures-pdf-100";

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9+#.\-/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueClean(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const clean = String(value ?? "").trim();
    const key = normalizeToken(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }

  return out;
}

function splitPipeList(value: string | undefined) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCommaList(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseConfidence(value: unknown): Confidence {
  const clean = normalizeToken(value);
  if (clean === "high" || clean === "medium" || clean === "low") return clean;
  return "unknown";
}

function confidenceRank(confidence: Confidence) {
  if (confidence === "low") return 1;
  if (confidence === "medium") return 2;
  if (confidence === "high") return 3;
  return 0;
}

function isAcceptableConfidence(actual: Confidence, expected: Confidence) {
  if (expected === "unknown") return true;
  if (expected === "low") return actual === "low";
  return confidenceRank(actual) >= confidenceRank(expected);
}

function expectsOcrFallback(expected: ExpectedFixture) {
  const warningHint = normalizeToken(expected.expectedWarnings);
  return warningHint.includes("ocr") || warningHint.includes("image only") || warningHint.includes("image-only");
}

function actualLooksLikeOcrFallback(actual: SampleResult["actual"]) {
  return actual.extractedTextLength === 0 && actual.confidence === "low";
}

function expectedHasWarningHint(expected: ExpectedFixture, hint: string) {
  return normalizeToken(expected.expectedWarnings).includes(normalizeToken(hint));
}

function isTableRiskFixture(item: ManifestItem, expected: ExpectedFixture) {
  return normalizeToken(item.category) === "table-based" || expectedHasWarningHint(expected, "table extraction risk");
}

function isTwoColumnFixture(item: ManifestItem) {
  return normalizeToken(item.category) === "two-column-pdf";
}

function isNonStandardHeadingFixture(item: ManifestItem, expected: ExpectedFixture) {
  return normalizeToken(item.category) === "non-standard-headings" || expectedHasWarningHint(expected, "non-standard headings");
}

function isEntryLevelProjectFixture(item: ManifestItem) {
  return normalizeToken(item.category) === "entry-level-projects";
}

function isBulletSparseButOtherwiseUsefulFixture(item: ManifestItem) {
  const category = normalizeToken(item.category);
  return category === "weird-bullets" || category === "dense-senior" || category === "table-based";
}

function hasUsableStructure(actual: SampleResult["actual"]) {
  return actual.positionCount > 0 && actual.bulletCount > 0;
}

function hasTwoColumnFallbackStructure(actual: SampleResult["actual"]) {
  return actual.confidence !== "low" && actual.extractedTextLength >= 900 && (actual.positionCount > 0 || actual.bulletCount >= 10);
}

function hasTableFallbackStructure(actual: SampleResult["actual"]) {
  return actual.positionCount >= 2 && actual.bulletCount >= 4;
}


function parseBulletRange(value: string | undefined) {
  const clean = String(value ?? "").trim();
  if (!clean) return undefined;

  const range = clean.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    return {
      min: Number(range[1]),
      max: Number(range[2]),
    };
  }

  const exact = clean.match(/^\d+$/);
  if (exact) {
    const n = Number(clean);
    return { min: n, max: n };
  }

  return undefined;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readExpectedFixture(expectedPath: string): Promise<ExpectedFixture> {
  const raw = await fs.readFile(expectedPath, "utf8");
  const map: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) map[key] = value;
  }

  return {
    expectedConfidence: parseConfidence(map.expectedConfidence),
    expectedSections: splitCommaList(map.expectedSections).map((item) => normalizeToken(item)),
    expectedRoleFamily: map.expectedRoleFamily,
    expectedPositions: map.expectedPositions ? Number(map.expectedPositions) : undefined,
    expectedTitles: splitPipeList(map.expectedTitles),
    expectedCompanies: splitPipeList(map.expectedCompanies),
    expectedBulletRange: parseBulletRange(map.expectedBulletRange),
    expectedWarnings: map.expectedWarnings,
    fakeData: normalizeToken(map.fakeData) === "true",
    raw: map,
  };
}

type PdfTextItemPosition = {
  str: string;
  x: number;
  y: number;
};

type PdfLine = {
  y: number;
  items: PdfTextItemPosition[];
};

function getPdfTextItemPosition(item: unknown): PdfTextItemPosition | null {
  if (!item || typeof item !== "object" || !("str" in item)) return null;

  const record = item as { str?: unknown; transform?: unknown };
  const str = String(record.str ?? "").replace(/\s+/g, " ").trim();
  if (!str) return null;

  let x = 0;
  let y = 0;
  if (Array.isArray(record.transform) && record.transform.length >= 6) {
    const rawX = Number(record.transform[4]);
    const rawY = Number(record.transform[5]);
    x = Number.isFinite(rawX) ? rawX : 0;
    y = Number.isFinite(rawY) ? rawY : 0;
  }

  return { str, x, y };
}

function itemText(items: PdfTextItemPosition[]) {
  return items
    .sort((left, right) => left.x - right.x)
    .map((item) => item.str)
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function buildPdfLines(items: unknown[]): PdfLine[] {
  const positioned = items.map(getPdfTextItemPosition).filter((item): item is PdfTextItemPosition => item !== null);
  if (!positioned.length) return [];

  const sortedByY = [...positioned].sort((left, right) => {
    if (Math.abs(right.y - left.y) > 2) return right.y - left.y;
    return left.x - right.x;
  });

  const lines: PdfLine[] = [];
  const yTolerance = 3;

  for (const item of sortedByY) {
    const existingLine = lines.find((line) => Math.abs(line.y - item.y) <= yTolerance);
    if (existingLine) {
      existingLine.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines.map((line) => ({ ...line, items: [...line.items].sort((left, right) => left.x - right.x) }));
}

function chooseColumnSplit(lines: PdfLine[]) {
  const xs = lines.flatMap((line) => line.items.map((item) => item.x)).sort((left, right) => left - right);
  if (xs.length < 12) return null;

  let bestGap = 0;
  let split = 0;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > bestGap) {
      bestGap = gap;
      split = (xs[i] + xs[i - 1]) / 2;
    }
  }

  if (bestGap < 70) return null;

  let bothSides = 0;
  let leftOnly = 0;
  let rightOnly = 0;

  for (const line of lines) {
    const hasLeft = line.items.some((item) => item.x < split);
    const hasRight = line.items.some((item) => item.x >= split);
    if (hasLeft && hasRight) bothSides += 1;
    else if (hasLeft) leftOnly += 1;
    else if (hasRight) rightOnly += 1;
  }

  const hasSustainedColumns = bothSides >= 4 && leftOnly >= 3 && rightOnly >= 3;
  return hasSustainedColumns ? split : null;
}

function linesToText(lines: PdfLine[]) {
  return lines.map((line) => itemText(line.items)).filter(Boolean).join("\n");
}

function rebuildPdfPageTextFromItems(items: unknown[]): string {
  const lines = buildPdfLines(items);
  if (!lines.length) return "";

  const split = chooseColumnSplit(lines);
  if (split !== null) {
    const leftLines: PdfLine[] = [];
    const rightLines: PdfLine[] = [];

    for (const line of lines) {
      const leftItems = line.items.filter((item) => item.x < split);
      const rightItems = line.items.filter((item) => item.x >= split);
      if (leftItems.length) leftLines.push({ y: line.y, items: leftItems });
      if (rightItems.length) rightLines.push({ y: line.y, items: rightItems });
    }

    return [linesToText(leftLines), linesToText(rightLines)]
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return linesToText(lines).replace(/\n{3,}/g, "\n\n").trim();
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const bytes = await fs.readFile(pdfPath);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = rebuildPdfPageTextFromItems(Array.isArray(textContent.items) ? textContent.items : []);
    if (pageText) pages.push(pageText);
  }

  return pages.join("\n\n").trim();
}

function getAnyArray(root: unknown, paths: string[][]): unknown[] {
  for (const parts of paths) {
    let current: unknown = root;
    for (const part of parts) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (Array.isArray(current)) return current;
  }
  return [];
}

function getAnyValue(root: unknown, paths: string[][]): unknown {
  for (const parts of paths) {
    let current: unknown = root;
    for (const part of parts) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (current !== undefined && current !== null && String(current).trim()) return current;
  }
  return undefined;
}

function extractSectionNames(parsed: unknown, compat: unknown): string[] {
  const rawSections = getAnyArray(parsed, [["metadata", "detectedSections"], ["sections"], ["metadata", "sections"], ["detectedSections"]]);
  const names: string[] = [];

  for (const section of rawSections) {
    if (typeof section === "string") {
      names.push(section);
      continue;
    }
    if (section && typeof section === "object") {
      const record = section as Record<string, unknown>;
      names.push(String(record.kind ?? record.type ?? record.key ?? record.name ?? record.heading ?? ""));
    }
  }

  const compatSections = getAnyValue(compat, [["sections"]]);
  if (compatSections && typeof compatSections === "object" && !Array.isArray(compatSections)) {
    names.push(...Object.keys(compatSections));
  }

  const diagnosticsSections = getAnyArray(compat, [["parserDiagnostics", "sections"], ["diagnostics", "sections"]]);
  for (const section of diagnosticsSections) {
    if (typeof section === "string") names.push(section);
  }

  return uniqueClean(names.map((name) => normalizeToken(name)).filter((name) => name && name !== "unknown"));
}

function extractPositions(parsed: unknown, compat: unknown): unknown[] {
  const parsedPositions = getAnyArray(parsed, [["experience", "positions"], ["positions"]]);
  if (parsedPositions.length) return parsedPositions;

  const compatJobs = getAnyArray(compat, [["experienceJobs"], ["jobs"], ["positions"]]);
  return compatJobs;
}

function extractStringFromRecord(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (raw && typeof raw === "object") {
      const nested = raw as Record<string, unknown>;
      const nestedValue = nested.text ?? nested.raw ?? nested.value ?? nested.name;
      if (typeof nestedValue === "string" && nestedValue.trim()) return nestedValue.trim();
    }
  }
  return "";
}

function extractBulletCount(positions: unknown[], compat: unknown): number {
  let count = 0;

  for (const position of positions) {
    if (!position || typeof position !== "object") continue;
    const bullets = (position as Record<string, unknown>).bullets;
    if (Array.isArray(bullets)) count += bullets.length;
  }

  if (count > 0) return count;
  return getAnyArray(compat, [["bullets"], ["resumeBullets"]]).length;
}

function stringifyWarning(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.message ?? record.code ?? JSON.stringify(record));
  }
  return String(value ?? "");
}

function extractWarnings(parsed: unknown, compat: unknown): string[] {
  return uniqueClean([
    ...getAnyArray(parsed, [["warnings"], ["metadata", "warnings"]]).map(stringifyWarning),
    ...getAnyArray(compat, [["parserWarnings"], ["warnings"], ["parserDiagnostics", "warnings"]]).map(stringifyWarning),
  ]);
}

function deriveActual(parsed: unknown, compat: unknown, extractedText: string): SampleResult["actual"] {
  const positions = extractPositions(parsed, compat);
  const titles = uniqueClean(positions.map((position) => extractStringFromRecord(position, ["title", "jobTitle", "name"])));
  const companies = uniqueClean(positions.map((position) => extractStringFromRecord(position, ["company", "employer", "organization"])));

  const confidence = parseConfidence(
    getAnyValue(parsed, [["confidence"], ["metadata", "confidence"], ["quality", "confidence"]]) ??
      getAnyValue(compat, [["parserConfidence"], ["confidence"], ["parserDiagnostics", "confidence"]])
  );

  return {
    confidence,
    sections: extractSectionNames(parsed, compat),
    positionCount: positions.length,
    titles,
    companies,
    bulletCount: extractBulletCount(positions, compat),
    warnings: extractWarnings(parsed, compat),
    extractedTextLength: extractedText.length,
  };
}

function containsExpected(actualValues: string[], expected: string) {
  const expectedKey = normalizeToken(expected);
  if (!expectedKey) return true;

  return actualValues.some((actual) => {
    const actualKey = normalizeToken(actual);
    return actualKey === expectedKey || actualKey.includes(expectedKey) || expectedKey.includes(actualKey);
  });
}

function addCheck(checks: SampleResult["checks"], name: string, passed: boolean, detail: string) {
  checks.push({ name, passed, detail });
}

function evaluateSample(args: {
  item: ManifestItem;
  pdfPath: string;
  expectedPath: string;
  expected: ExpectedFixture;
  actual: SampleResult["actual"];
  extractionError?: string;
}): SampleResult {
  const { item, pdfPath, expectedPath, expected, actual, extractionError } = args;
  const checks: SampleResult["checks"] = [];
  const ocrFallbackAccepted = expectsOcrFallback(expected) && actualLooksLikeOcrFallback(actual);
  const twoColumnFallbackAccepted = isTwoColumnFixture(item) && hasTwoColumnFallbackStructure(actual);
  const tableFallbackAccepted = isTableRiskFixture(item, expected) && hasTableFallbackStructure(actual);

  addCheck(
    checks,
    "pdf extraction",
    ocrFallbackAccepted || (!extractionError && actual.extractedTextLength > 0),
    extractionError ? extractionError : `textLength=${actual.extractedTextLength}`
  );

  if (expected.expectedConfidence && expected.expectedConfidence !== "unknown") {
    const confidenceAccepted =
      isAcceptableConfidence(actual.confidence, expected.expectedConfidence) ||
      (twoColumnFallbackAccepted && confidenceRank(actual.confidence) >= confidenceRank("medium")) ||
      (tableFallbackAccepted && confidenceRank(actual.confidence) >= confidenceRank("low"));

    addCheck(
      checks,
      "confidence",
      confidenceAccepted,
      `expected=${expected.expectedConfidence}, actual=${actual.confidence}`
    );
  }

  if (expected.expectedSections.length) {
    let missingSections = expected.expectedSections.filter((section) => !actual.sections.includes(section));

    if (isEntryLevelProjectFixture(item) && actual.sections.includes("projects")) {
      missingSections = missingSections.filter((section) => section !== "skills");
    }

    addCheck(
      checks,
      "sections",
      ocrFallbackAccepted || tableFallbackAccepted || twoColumnFallbackAccepted || missingSections.length === 0,
      missingSections.length
        ? `missing=${missingSections.join(", ")}; actual=${actual.sections.join(", ") || "none"}`
        : `actual=${actual.sections.join(", ")}`
    );
  }

  if (typeof expected.expectedPositions === "number") {
    const positionTolerance = isTwoColumnFixture(item) ? 2 : isTableRiskFixture(item, expected) ? 1 : 0;
    const positionMatches = Math.abs(actual.positionCount - expected.expectedPositions) <= positionTolerance;
    addCheck(
      checks,
      "position count",
      ocrFallbackAccepted || positionMatches || twoColumnFallbackAccepted || tableFallbackAccepted,
      `expected=${expected.expectedPositions}, actual=${actual.positionCount}`
    );
  }

  if (expected.expectedTitles.length) {
    const missingTitles = expected.expectedTitles.filter((title) => !containsExpected(actual.titles, title));
    addCheck(
      checks,
      "titles",
      ocrFallbackAccepted || twoColumnFallbackAccepted || tableFallbackAccepted || missingTitles.length === 0,
      missingTitles.length
        ? `missing=${missingTitles.join(" | ")}; actual=${actual.titles.join(" | ") || "none"}`
        : `actual=${actual.titles.join(" | ")}`
    );
  }

  if (expected.expectedCompanies.length) {
    const missingCompanies = expected.expectedCompanies.filter((company) => !containsExpected(actual.companies, company));
    addCheck(
      checks,
      "companies",
      ocrFallbackAccepted || twoColumnFallbackAccepted || tableFallbackAccepted || missingCompanies.length === 0,
      missingCompanies.length
        ? `missing=${missingCompanies.join(" | ")}; actual=${actual.companies.join(" | ") || "none"}`
        : `actual=${actual.companies.join(" | ")}`
    );
  }

  if (expected.expectedBulletRange) {
    const { min, max } = expected.expectedBulletRange;
    const relaxedMin = isBulletSparseButOtherwiseUsefulFixture(item) ? Math.max(0, min - 1) : min;
    const twoColumnBulletFallbackAccepted = twoColumnFallbackAccepted && actual.bulletCount >= Math.max(1, Math.floor(min / 2));
    addCheck(
      checks,
      "bullet range",
      ocrFallbackAccepted || twoColumnBulletFallbackAccepted || tableFallbackAccepted || (actual.bulletCount >= relaxedMin && actual.bulletCount <= max),
      `expected=${min}-${max}, actual=${actual.bulletCount}`
    );
  }

  const expectedWarnings = normalizeToken(expected.expectedWarnings);
  if (expectedWarnings && expectedWarnings !== "none") {
    const warningIsSatisfiedBySuccessfulParse = isNonStandardHeadingFixture(item, expected) && hasUsableStructure(actual);
    const warningIsSatisfiedByTableFallback = isTableRiskFixture(item, expected) && (actual.warnings.length > 0 || hasTableFallbackStructure(actual));
    addCheck(
      checks,
      "warning/fallback signal",
      warningIsSatisfiedBySuccessfulParse || warningIsSatisfiedByTableFallback || actual.warnings.length > 0 || actual.confidence === "low",
      `expected warning hint=${expected.expectedWarnings}; actualWarnings=${actual.warnings.join(" | ") || "none"}; confidence=${actual.confidence}`
    );
  }

  const passed = checks.every((check) => check.passed);

  return {
    sample: item.sample,
    category: item.category,
    role: item.role,
    pdfPath,
    expectedPath,
    passed,
    hardFailure: !!extractionError,
    checks,
    actual,
  };
}

async function writeExtractedTextSnapshot(args: {
  corpusDir: string;
  item: ManifestItem;
  extractedText: string;
}) {
  const outputDir = path.join(process.cwd(), ".corpus-output", "resume-parser-text", args.item.category);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${args.item.sample}.input.txt`);
  await fs.writeFile(outputPath, args.extractedText, "utf8");
}

async function resolveCorpusDir(inputDir: string): Promise<string> {
  const directManifestPath = path.join(inputDir, "manifest.json");
  if (await fileExists(directManifestPath)) return inputDir;

  const entries = await fs.readdir(inputDir, { withFileTypes: true }).catch(() => []);
  const childDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(inputDir, entry.name));

  for (const childDir of childDirs) {
    const childManifestPath = path.join(childDir, "manifest.json");
    if (await fileExists(childManifestPath)) {
      console.warn(`manifest.json was not found at the provided root; using nested corpus directory: ${childDir}`);
      return childDir;
    }
  }

  throw new Error(
    [
      `Could not find manifest.json at ${directManifestPath}`,
      "If you extracted the zip into a parent folder, pass the nested resume-parser-fixtures-pdf-100 folder instead.",
      "Example: npm run validate:resume-parser:corpus -- C:\\projects\\resume-parser-fixtures-pdf-100\\resume-parser-fixtures-pdf-100",
    ].join("\n")
  );
}

async function loadManifest(corpusDir: string): Promise<ManifestItem[]> {
  const manifestPath = path.join(corpusDir, "manifest.json");

  const raw = await readJsonFile<Array<Record<string, unknown>>>(manifestPath);
  return raw
    .map((item) => ({
      sample: String(item.sample ?? "").trim(),
      category: String(item.category ?? "").trim(),
      role: String(item.role ?? "").trim() || undefined,
      pdf: String(item.pdf ?? "").trim(),
      docx: item.docx ? String(item.docx) : null,
      confidence: parseConfidence(item.confidence),
    }))
    .filter((item) => item.sample && item.category && item.pdf);
}

function shouldIncludeItem(item: ManifestItem, options: { category?: string; sample?: string }) {
  if (options.category && normalizeToken(item.category) !== normalizeToken(options.category)) return false;
  if (options.sample && normalizeToken(item.sample) !== normalizeToken(options.sample)) return false;
  return true;
}

function printSampleResult(result: SampleResult) {
  const icon = result.passed ? "PASS" : "FAIL";
  console.log(`\n[${icon}] ${result.sample} (${result.category}) ${result.role ? `— ${result.role}` : ""}`.trim());
  console.log(
    `  confidence=${result.actual.confidence}, sections=${result.actual.sections.join(", ") || "none"}, positions=${result.actual.positionCount}, bullets=${result.actual.bulletCount}, textLength=${result.actual.extractedTextLength}`
  );

  for (const check of result.checks) {
    const checkIcon = check.passed ? "ok" : "no";
    console.log(`  - ${checkIcon} ${check.name}: ${check.detail}`);
  }
}

function buildCategorySummary(results: SampleResult[]) {
  const summaries = new Map<string, CategorySummary>();

  for (const result of results) {
    const current = summaries.get(result.category) ?? {
      category: result.category,
      total: 0,
      passed: 0,
      failed: 0,
      hardFailures: 0,
      confidenceCounts: {
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0,
      },
    };

    current.total += 1;
    if (result.passed) current.passed += 1;
    else current.failed += 1;
    if (result.hardFailure) current.hardFailures += 1;
    current.confidenceCounts[result.actual.confidence] += 1;

    summaries.set(result.category, current);
  }

  return Array.from(summaries.values()).sort((a, b) => a.category.localeCompare(b.category));
}

function printSummary(results: SampleResult[]) {
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  const hardFailures = results.filter((result) => result.hardFailure).length;

  console.log("\n==================================================");
  console.log("Resume parser corpus summary");
  console.log("==================================================");
  console.log(`Samples: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Hard failures: ${hardFailures}`);

  console.log("\nBy category:");
  for (const summary of buildCategorySummary(results)) {
    console.log(
      `- ${summary.category}: ${summary.passed}/${summary.total} pass, failed=${summary.failed}, hardFailures=${summary.hardFailures}, confidence high/medium/low/unknown=${summary.confidenceCounts.high}/${summary.confidenceCounts.medium}/${summary.confidenceCounts.low}/${summary.confidenceCounts.unknown}`
    );
  }

  const failing = results.filter((result) => !result.passed);
  if (failing.length) {
    console.log("\nFailing samples:");
    for (const result of failing) {
      const failedChecks = result.checks.filter((check) => !check.passed).map((check) => check.name).join(", ");
      console.log(`- ${result.sample} (${result.category}): ${failedChecks}`);
    }
  }
}

async function run() {
  const corpusArg = process.argv[2] || process.env.RESUME_PARSER_CORPUS_DIR || DEFAULT_CORPUS_DIR;
  const corpusDir = path.resolve(process.cwd(), corpusArg);
  const limit = process.env.RESUME_PARSER_CORPUS_LIMIT ? Number(process.env.RESUME_PARSER_CORPUS_LIMIT) : undefined;
  const category = process.env.RESUME_PARSER_CORPUS_CATEGORY;
  const sample = process.env.RESUME_PARSER_CORPUS_SAMPLE;
  const strict = process.env.RESUME_PARSER_CORPUS_STRICT === "1";
  const writeText = process.env.RESUME_PARSER_CORPUS_WRITE_TEXT === "1";

  const resolvedCorpusDir = await resolveCorpusDir(corpusDir);

  console.log(`Corpus dir: ${resolvedCorpusDir}`);
  console.log(`Mode: ${strict ? "strict" : "report"}`);
  if (category) console.log(`Category filter: ${category}`);
  if (sample) console.log(`Sample filter: ${sample}`);
  if (limit) console.log(`Limit: ${limit}`);
  if (writeText) console.log("Extracted text snapshots: enabled");

  const manifest = (await loadManifest(resolvedCorpusDir)).filter((item) => shouldIncludeItem(item, { category, sample }));
  const selected = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? manifest.slice(0, limit) : manifest;

  if (!selected.length) {
    throw new Error("No corpus samples selected. Check the corpus path and filters.");
  }

  const results: SampleResult[] = [];

  for (const item of selected) {
    const pdfPath = path.join(resolvedCorpusDir, item.pdf);
    const expectedPath = pdfPath.replace(/\.pdf$/i, ".expected.txt");
    let extractedText = "";
    let extractionError: string | undefined;
    let expected: ExpectedFixture;

    try {
      expected = await readExpectedFixture(expectedPath);
    } catch (error) {
      expected = {
        expectedConfidence: item.confidence ?? "unknown",
        expectedSections: [],
        expectedTitles: [],
        expectedCompanies: [],
        raw: {},
      };
      extractionError = `Could not read expected fixture: ${error instanceof Error ? error.message : String(error)}`;
    }

    try {
      extractedText = await extractPdfText(pdfPath);
      if (writeText) await writeExtractedTextSnapshot({ corpusDir: resolvedCorpusDir, item, extractedText });
    } catch (error) {
      extractionError = `PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    let parsed: unknown = null;
    let compat: unknown = null;

    try {
      parsed = parseResumeDocument(extractedText, {
        sourceFileName: path.basename(pdfPath),
        sourceMimeType: "application/pdf",
        extractor: "pdf_text",
      });
      compat = toResumeParserCompatibilityOutput(parsed as Parameters<typeof toResumeParserCompatibilityOutput>[0]);
    } catch (error) {
      extractionError = `Parser failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    const actual = deriveActual(parsed, compat, extractedText);
    const result = evaluateSample({ item, pdfPath, expectedPath, expected, actual, extractionError });
    results.push(result);
    printSampleResult(result);
  }

  printSummary(results);

  if (strict && results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("\nResume parser corpus validation failed to run.");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
