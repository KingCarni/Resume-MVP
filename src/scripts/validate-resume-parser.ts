import fs from "fs";
import mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseResumeDocument } from "@/lib/resumeParser";

type ParserConfidence = "high" | "medium" | "low";

type ExpectedSection =
  | "contact"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "certifications"
  | "projects"
  | "interests"
  | "unknown";

type FixtureExpectation = {
  minConfidence?: ParserConfidence;
  sections?: ExpectedSection[];
  minPositions?: number;
  maxPositions?: number;
  minBullets?: number;
  maxUnattachedBullets?: number;
  titles?: string[];
  companies?: string[];
  excludedTitles?: string[];
  excludedCompanies?: string[];
  email?: string;
  phoneIncludes?: string;
  expectedName?: string;
  expectLocationEmpty?: boolean;
  skills?: string[];
  bannedSkills?: string[];
};

type FixtureCase = {
  name: string;
  sourceFileName: string;
  sourceMimeType: string;
  extractor: "plain_text" | "pdf_text" | "docx_mammoth";
  text?: string;
  loadText?: () => Promise<string>;
  expect: FixtureExpectation;
};

type Failure = {
  caseName: string;
  message: string;
};

const confidenceRank: Record<ParserConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalizeForMatch(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[•●▪◦‣·]/g, " - ")
    .replace(/[^\w+#./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesLoose(haystack: unknown, needle: unknown) {
  const h = normalizeForMatch(haystack);
  const n = normalizeForMatch(needle);
  return !!h && !!n && h.includes(n);
}

function failIf(condition: boolean, failures: Failure[], caseName: string, message: string) {
  if (condition) failures.push({ caseName, message });
}

function normalizeFixtureEncoding(text: string) {
  return String(text || "")
    .replace(/Ã¢â‚¬Â¢|Ã¯â€šÂ§|Ã¢â€“Âª|Ã¢â€”Â¦/g, "•")
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€|Ã¢â‚¬â€"|Ã¢â‚¬â€œ/g, "-");
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = String(value ?? "").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function normalizePdfText(s: string) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\b([a-z])\s+([a-z]{1,2})\s+([a-z])\b/gi, "$1$2$3")
    .replace(/[ \t]+/g, " ")
    .trim();
}

type PdfItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hasEOL: boolean;
};

type PdfLine = {
  y: number;
  xMin: number;
  xMax: number;
  parts: { x: number; text: string }[];
};

function buildItemsFromTextContentItems(items: any[]): PdfItem[] {
  const out: PdfItem[] = [];
  for (const it of items) {
    const raw = String(it?.str ?? "");
    const text = normalizePdfText(raw);
    if (!text && !it?.hasEOL) continue;

    const tr = Array.isArray(it?.transform) ? it.transform : null;
    const x = tr ? Number(tr[4] ?? 0) : 0;
    const y = tr ? Number(tr[5] ?? 0) : 0;

    out.push({
      str: text,
      x,
      y,
      w: Number(it?.width ?? 0),
      h: Number(it?.height ?? 0),
      hasEOL: Boolean(it?.hasEOL),
    });
  }
  return out;
}

function groupItemsIntoLines(items: PdfItem[]) {
  const sorted = [...items].sort((a, b) => {
    if (b.y !== a.y) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: PdfLine[] = [];
  const yTolerance = 2.25;

  for (const it of sorted) {
    if (!it.str && !it.hasEOL) continue;

    let line = lines.find((candidate) => Math.abs(candidate.y - it.y) <= yTolerance);
    if (!line) {
      line = { y: it.y, xMin: it.x, xMax: it.x + (it.w || 0), parts: [] };
      lines.push(line);
    }

    if (it.str) {
      line.parts.push({ x: it.x, text: it.str });
      line.xMin = Math.min(line.xMin, it.x);
      line.xMax = Math.max(line.xMax, it.x + (it.w || 0));
    }
  }

  const normalized: { y: number; xMin: number; xMax: number; text: string }[] = [];

  for (const line of lines) {
    const parts = [...line.parts].sort((a, b) => a.x - b.x);
    let text = "";
    let lastX: number | null = null;

    for (const part of parts) {
      const next = normalizePdfText(part.text);
      if (!next) continue;

      if (!text) {
        text = next;
        lastX = part.x;
        continue;
      }

      const gap = lastX == null ? 0 : part.x - lastX;
      if (gap > 6) text += " ";
      if (!text.endsWith(" ") && !/^[,.:;)\]]/.test(next) && !/[([/]\s*$/.test(text)) text += " ";

      text += next;
      lastX = part.x;
    }

    const clean = normalizePdfText(text);
    if (!clean) continue;
    normalized.push({ y: line.y, xMin: line.xMin, xMax: line.xMax, text: clean });
  }

  normalized.sort((a, b) => b.y - a.y);
  return normalized;
}

function splitIntoColumnsIfNeeded(lines: { y: number; xMin: number; xMax: number; text: string }[]) {
  if (lines.length < 8) return { columns: [lines] };

  const xMins = lines.map((line) => line.xMin).sort((a, b) => a - b);
  const medianXMin = xMins[Math.floor(xMins.length / 2)] ?? 0;
  const maxXMin = xMins[xMins.length - 1] ?? 0;
  const spread = maxXMin - medianXMin;

  if (spread < 140) return { columns: [lines] };

  const splitX = medianXMin + Math.min(180, Math.max(120, spread * 0.55));
  const left: typeof lines = [];
  const right: typeof lines = [];

  for (const line of lines) {
    const midpoint = (line.xMin + line.xMax) / 2;
    if (midpoint >= splitX) right.push(line);
    else left.push(line);
  }

  if (right.length <= Math.max(3, Math.floor(lines.length * 0.12))) {
    return { columns: [lines] };
  }

  return { columns: [left, right] };
}

async function extractPdfFixtureText(filePath: string) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjs.getDocument({
    data,
    verbosity: 0,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  let out = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rawItems: any[] = Array.isArray(content?.items) ? content.items : [];
    if (!rawItems.length) {
      out += "\n\n";
      continue;
    }

    const items = buildItemsFromTextContentItems(rawItems);
    const lines = groupItemsIntoLines(items);
    const columns = splitIntoColumnsIfNeeded(lines);
    out += columns.columns.map((column) => column.map((line) => line.text).join("\n")).join("\n\n") + "\n\n";
  }

  return out.trim();
}

async function extractDocxFixtureText(filePath: string) {
  const result = await mammoth.extractRawText({ path: filePath });
  return String(result.value || "").trim();
}

function getSectionKinds(parsed: ReturnType<typeof parseResumeDocument>): string[] {
  return uniqueStrings((parsed.metadata.detectedSections ?? []).map((section) => String(section.kind ?? "")));
}

function getPositionTitles(parsed: ReturnType<typeof parseResumeDocument>): string[] {
  return (parsed.experience?.positions ?? [])
    .map((position) => String(position.title ?? "").trim())
    .filter(Boolean);
}

function getPositionCompanies(parsed: ReturnType<typeof parseResumeDocument>): string[] {
  return (parsed.experience?.positions ?? [])
    .map((position) => String(position.company ?? "").trim())
    .filter(Boolean);
}

function getBulletTexts(parsed: ReturnType<typeof parseResumeDocument>): string[] {
  return (parsed.experience?.positions ?? []).flatMap((position) =>
    (position.bullets ?? []).map((bullet) => String(bullet.text ?? "").trim()).filter(Boolean)
  );
}

function getRawAndNormalizedSkills(parsed: ReturnType<typeof parseResumeDocument>): string[] {
  const raw = (parsed.skills?.raw ?? []).map((skill) => String(skill ?? "").trim()).filter(Boolean);
  const normalized = (parsed.skills?.normalized ?? []).map((skill) => String(skill ?? "").trim()).filter(Boolean);
  return uniqueStrings([...raw, ...normalized]);
}

const fixtures: FixtureCase[] = [
  {
    name: "Homer fake resume parses Night Auditor with Employment History alias",
    sourceFileName: "fake-homer-simpson-resume.txt",
    sourceMimeType: "text/plain",
    extractor: "plain_text",
    text: `
Homer J. Simpson
Springfield, OR
homer.simpson@example.com
(555) 123-4567
linkedin.com/in/homer-simpson

Professional Summary
Reliable hospitality and operations worker with experience supporting overnight guest service, front desk operations, and issue resolution.

Employment History

Night Auditor
Springfield Inn
May 2017 to Present
â€¢ Balanced nightly reports and reconciled guest accounts with consistent attention to detail.
â€¢ Responded to guest concerns, escalated maintenance issues, and documented shift notes for day staff.
â€¢ Used property management software, spreadsheets, and email to support front desk operations.
  Continued communicating urgent updates clearly across departments.

Safety Coordinator
Springfield Nuclear Plant
November 2013 to June 2016
ï‚§ Supported daily safety checks and documented incidents for supervisor review.
â–ª Coordinated with maintenance teams to flag hazards and reduce recurring problems.

Education
Springfield Community College
Certificate in Hospitality Operations

Skills
Customer Service, Night Audit, Guest Relations, Reporting, Microsoft Excel, Documentation
`.trim(),
    expect: {
      minConfidence: "medium",
      sections: ["summary", "experience", "education", "skills"],
      minPositions: 2,
      minBullets: 5,
      titles: ["Night Auditor", "Safety Coordinator"],
      companies: ["Springfield Inn", "Springfield Nuclear Plant"],
      email: "homer.simpson@example.com",
      phoneIncludes: "555",
      skills: ["Customer Service", "Night Audit", "Microsoft Excel"],
    },
  },
  {
    name: "Simple food service resume parses Host and Food Service Management Intern",
    sourceFileName: "fake-food-service-resume.txt",
    sourceMimeType: "text/plain",
    extractor: "plain_text",
    text: `
Marge Bouvier
marge.bouvier@example.com
555.222.9090
Springfield, OR

Summary
Food service professional with guest-facing experience, scheduling exposure, and training support.

Work Experience

Host - The Frying Dutchman | 01/2015-06/2017
- Greeted guests, managed waitlists, and supported table turnover during peak dinner service.
- Answered phone inquiries and coordinated reservations with servers and management.
- Maintained clean front-of-house areas and communicated guest concerns to shift leads.

Food Service Management Intern
Krusty Burger
07/2017 - 07/2018
* Assisted managers with inventory checks, shift handoffs, and staff communication.
* Reviewed order accuracy and helped document recurring customer service issues.
  This continuation line should stay attached to the previous bullet rather than becoming a fake job.

Education
Springfield High School

Technical Skills
POS Systems, Scheduling, Inventory, Customer Service, Food Safety
`.trim(),
    expect: {
      minConfidence: "medium",
      sections: ["summary", "experience", "education", "skills"],
      minPositions: 2,
      minBullets: 5,
      titles: ["Host", "Food Service Management Intern"],
      companies: ["The Frying Dutchman", "Krusty Burger"],
      email: "marge.bouvier@example.com",
      phoneIncludes: "555",
      skills: ["POS Systems", "Scheduling", "Inventory", "Food Safety"],
    },
  },
  {
    name: "Bullet glyph and date range coverage",
    sourceFileName: "fake-glyph-date-coverage.txt",
    sourceMimeType: "text/plain",
    extractor: "plain_text",
    text: `
Lisa Simpson
lisa@example.com
Springfield, OR

Objective
Detail-oriented QA learner seeking software testing opportunities.

Relevant Experience

QA Volunteer â€” Springfield App Lab â€” 2017 â€“ Present
â—¦ Tested student web apps and recorded reproducible issues.
â€¢ Created concise bug notes with browser, steps, and expected results.
â€¢ Paired with developers to confirm fixes before release.

Junior Tester
Evergreen QA Studio
2015 - 2017
- Ran smoke tests for weekly builds.
- Tracked issues in Jira and verified release notes.

Projects
Personal QA Portfolio
- Wrote sample test cases for login, search, and checkout flows.

Areas of Expertise
Manual Testing, Bug Reports, Jira, Regression Testing, Test Cases
`.trim(),
    expect: {
      minConfidence: "medium",
      sections: ["summary", "experience", "projects", "skills"],
      minPositions: 2,
      minBullets: 5,
      titles: ["QA Volunteer", "Junior Tester"],
      companies: ["Springfield App Lab", "Evergreen QA Studio"],
      email: "lisa@example.com",
      skills: ["Manual Testing", "Bug Reports", "Jira", "Regression Testing"],
    },
  },
  {
    name: "ATest docx regression fixture preserves clean DOCX structure",
    sourceFileName: "ATest.docx",
    sourceMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extractor: "docx_mammoth",
    loadText: () => extractDocxFixtureText("C:/Users/theti/Downloads/ATest.docx"),
    expect: {
      minConfidence: "high",
      sections: ["summary", "experience", "skills"],
      minPositions: 4,
      maxPositions: 4,
      minBullets: 12,
      maxUnattachedBullets: 0,
      titles: [
        "QA Lead",
        "QA VR Biomedical Specialist",
        "Software Test Engineer 3",
        "Dev Support Tier 4/QA Lead",
      ],
      companies: [
        "Prodigy Education",
        "PrecisionOS",
        "Microsoft / Ascendion",
        "EA/Keywords Studios",
      ],
      email: "harleydean17@gmail.com",
      phoneIncludes: "236",
      expectedName: "Harley-Dean Curtis",
      expectLocationEmpty: true,
      skills: ["QA Process Optimization", "VR Biomedical Testing", "JIRA Cloud Migration"],
      bannedSkills: [
        "gmail.com",
        "and addressing feedback.",
        "completed prodigy",
        "and arthroscope modules.",
        "supported jira migration",
      ],
    },
  },
  {
    name: "OG Resume pdf regression fixture preserves real dated jobs",
    sourceFileName: "OG Resume.pdf",
    sourceMimeType: "application/pdf",
    extractor: "pdf_text",
    loadText: () => extractPdfFixtureText("C:/Users/theti/Downloads/OG Resume.pdf"),
    expect: {
      minConfidence: "medium",
      sections: ["experience", "skills", "education"],
      minPositions: 6,
      maxPositions: 6,
      minBullets: 20,
      maxUnattachedBullets: 4,
      titles: [
        "Software Engineer - C#, Type S cript - Unity",
        "Full - S tack Software Engineer - C# .NET, Type S cript, REST, SQL",
        "Software Engineer - Type S cript, C# .NET, VUE",
        "Freelancer Developer - JavaScript",
        "Software Engineer - C#, Unity, 2026 - present (Contract)",
        "Software Design Engineer Internship - JavaScript",
      ],
      companies: [
        "Prodigy Education",
        "Gatarn Games Ltd",
        "Imagine Communications",
        "Viral Staging",
        "McMaster Children’s Hospital",
        "Evertz",
      ],
      excludedCompanies: [
        "SDK - agnostic ad - integration layers supporting multiple providers",
        "Languages & Frameworks: TypeScript, C#, .NET, SQL, JavaScript, React, Unity",
      ],
      email: "thientrandinh@gmail.com",
      phoneIncludes: "905",
      expectedName: "THIEN TRANDINH, MASc",
      skills: ["TypeScript", "C#", "SQL", "React", "Jira"],
      bannedSkills: [
        "thientrandinh gmail.com",
        "linkedin.com in thien trandinh",
        "led development of skillfite.io",
        "and retrospectives using jira",
      ],
    },
  },
];

async function loadFixtureText(fixture: FixtureCase) {
  if (fixture.text) return normalizeFixtureEncoding(fixture.text);
  if (fixture.loadText) return fixture.loadText();
  throw new Error(`Fixture "${fixture.name}" has no text source.`);
}

async function assertFixture(fixture: FixtureCase): Promise<Failure[]> {
  const text = await loadFixtureText(fixture);
  const parsed = parseResumeDocument(text, {
    sourceFileName: fixture.sourceFileName,
    sourceMimeType: fixture.sourceMimeType,
    extractor: fixture.extractor,
  });

  const failures: Failure[] = [];
  const caseName = fixture.name;

  failIf(!parsed, failures, caseName, "Parser returned no document.");

  const plainText = parsed.metadata?.plainText ?? "";
  failIf(!plainText.trim(), failures, caseName, "Parsed metadata.plainText is empty.");

  const expectedConfidence = fixture.expect.minConfidence;
  if (expectedConfidence) {
    const actual = parsed.metadata?.confidence ?? "low";
    failIf(
      confidenceRank[actual] < confidenceRank[expectedConfidence],
      failures,
      caseName,
      `Expected confidence >= ${expectedConfidence}, received ${actual}.`
    );
  }

  const sectionKinds = getSectionKinds(parsed);
  for (const section of fixture.expect.sections ?? []) {
    failIf(
      !sectionKinds.includes(section),
      failures,
      caseName,
      `Expected detected section "${section}". Detected sections: ${sectionKinds.join(", ") || "(none)"}.`
    );
  }

  const positions = parsed.experience?.positions ?? [];
  if (typeof fixture.expect.minPositions === "number") {
    failIf(
      positions.length < fixture.expect.minPositions,
      failures,
      caseName,
      `Expected at least ${fixture.expect.minPositions} positions, found ${positions.length}.`
    );
  }
  if (typeof fixture.expect.maxPositions === "number") {
    failIf(
      positions.length > fixture.expect.maxPositions,
      failures,
      caseName,
      `Expected at most ${fixture.expect.maxPositions} positions, found ${positions.length}.`
    );
  }

  const bulletTexts = getBulletTexts(parsed);
  if (typeof fixture.expect.minBullets === "number") {
    failIf(
      bulletTexts.length < fixture.expect.minBullets,
      failures,
      caseName,
      `Expected at least ${fixture.expect.minBullets} bullets, found ${bulletTexts.length}.`
    );
  }

  if (typeof fixture.expect.maxUnattachedBullets === "number") {
    failIf(
      parsed.experience.unattachedBullets.length > fixture.expect.maxUnattachedBullets,
      failures,
      caseName,
      `Expected at most ${fixture.expect.maxUnattachedBullets} unattached bullets, found ${parsed.experience.unattachedBullets.length}.`
    );
  }

  const titles = getPositionTitles(parsed);
  for (const title of fixture.expect.titles ?? []) {
    failIf(
      !titles.some((actual) => includesLoose(actual, title)),
      failures,
      caseName,
      `Expected title "${title}". Parsed titles: ${titles.join(" | ") || "(none)"}.`
    );
  }
  for (const title of fixture.expect.excludedTitles ?? []) {
    failIf(
      titles.some((actual) => includesLoose(actual, title)),
      failures,
      caseName,
      `Unexpected title "${title}". Parsed titles: ${titles.join(" | ") || "(none)"}.`
    );
  }

  const companies = getPositionCompanies(parsed);
  for (const company of fixture.expect.companies ?? []) {
    failIf(
      !companies.some((actual) => includesLoose(actual, company)),
      failures,
      caseName,
      `Expected company "${company}". Parsed companies: ${companies.join(" | ") || "(none)"}.`
    );
  }
  for (const company of fixture.expect.excludedCompanies ?? []) {
    failIf(
      companies.some((actual) => includesLoose(actual, company)),
      failures,
      caseName,
      `Unexpected company "${company}". Parsed companies: ${companies.join(" | ") || "(none)"}.`
    );
  }

  if (fixture.expect.email) {
    failIf(
      normalizeForMatch(parsed.contact?.email) !== normalizeForMatch(fixture.expect.email),
      failures,
      caseName,
      `Expected email "${fixture.expect.email}", received "${parsed.contact?.email ?? ""}".`
    );
  }

  if (fixture.expect.phoneIncludes) {
    failIf(
      !String(parsed.contact?.phone ?? "").includes(fixture.expect.phoneIncludes),
      failures,
      caseName,
      `Expected phone to include "${fixture.expect.phoneIncludes}", received "${parsed.contact?.phone ?? ""}".`
    );
  }

  if (fixture.expect.expectedName) {
    failIf(
      !includesLoose(parsed.contact?.name, fixture.expect.expectedName),
      failures,
      caseName,
      `Expected name "${fixture.expect.expectedName}", received "${parsed.contact?.name ?? ""}".`
    );
  }

  if (fixture.expect.expectLocationEmpty) {
    failIf(
      !!String(parsed.contact?.location ?? "").trim(),
      failures,
      caseName,
      `Expected empty location, received "${parsed.contact?.location ?? ""}".`
    );
  }

  const skills = getRawAndNormalizedSkills(parsed);
  for (const skill of fixture.expect.skills ?? []) {
    failIf(
      !skills.some((actual) => includesLoose(actual, skill)),
      failures,
      caseName,
      `Expected skill "${skill}". Parsed skills: ${skills.join(", ") || "(none)"}.`
    );
  }
  for (const bannedSkill of fixture.expect.bannedSkills ?? []) {
    failIf(
      skills.some((actual) => includesLoose(actual, bannedSkill)),
      failures,
      caseName,
      `Unexpected skill fragment "${bannedSkill}". Parsed skills: ${skills.join(", ") || "(none)"}.`
    );
  }

  return failures;
}

async function printSuccessSummary() {
  console.log(`Resume parser validation passed (${fixtures.length} fixture cases).`);
  for (const fixture of fixtures) {
    const text = await loadFixtureText(fixture);
    const parsed = parseResumeDocument(text, {
      sourceFileName: fixture.sourceFileName,
      sourceMimeType: fixture.sourceMimeType,
      extractor: fixture.extractor,
    });

    const sections = getSectionKinds(parsed);
    const titles = getPositionTitles(parsed);
    const bulletCount = getBulletTexts(parsed).length;

    console.log(
      `- ${fixture.name}: confidence=${parsed.metadata.confidence}, sections=${sections.join(", ") || "none"}, positions=${
        parsed.experience.positions.length
      }, bullets=${bulletCount}, titles=${titles.join(" | ") || "none"}`
    );
  }
}

async function main() {
  const failures = (await Promise.all(fixtures.map(assertFixture))).flat();

  if (failures.length) {
    console.error(`Resume parser validation failed with ${failures.length} issue(s):`);
    for (const failure of failures) {
      console.error(`\n[${failure.caseName}]\n${failure.message}`);
    }

    console.error("\nFix only deterministic parser behavior inside JOB-141B parser scope.");
    process.exit(1);
  }

  await printSuccessSummary();
}

void main();
