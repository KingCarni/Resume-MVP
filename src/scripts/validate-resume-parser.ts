import { parseResumeDocument } from "@/lib/resumeParser";

type ParserConfidence = "high" | "medium" | "low";

type ExpectedSection =
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
  minBullets?: number;
  titles?: string[];
  companies?: string[];
  email?: string;
  phoneIncludes?: string;
  skills?: string[];
};

type FixtureCase = {
  name: string;
  sourceFileName: string;
  sourceMimeType: string;
  text: string;
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
• Balanced nightly reports and reconciled guest accounts with consistent attention to detail.
• Responded to guest concerns, escalated maintenance issues, and documented shift notes for day staff.
• Used property management software, spreadsheets, and email to support front desk operations.
  Continued communicating urgent updates clearly across departments.

Safety Coordinator
Springfield Nuclear Plant
November 2013 to June 2016
 Supported daily safety checks and documented incidents for supervisor review.
▪ Coordinated with maintenance teams to flag hazards and reduce recurring problems.

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
    text: `
Lisa Simpson
lisa@example.com
Springfield, OR

Objective
Detail-oriented QA learner seeking software testing opportunities.

Relevant Experience

QA Volunteer — Springfield App Lab — 2017 – Present
◦ Tested student web apps and recorded reproducible issues.
• Created concise bug notes with browser, steps, and expected results.
• Paired with developers to confirm fixes before release.

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
];

function assertFixture(fixture: FixtureCase): Failure[] {
  const parsed = parseResumeDocument(fixture.text, {
    sourceFileName: fixture.sourceFileName,
    sourceMimeType: fixture.sourceMimeType,
    extractor: "plain_text",
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

  const bulletTexts = getBulletTexts(parsed);
  if (typeof fixture.expect.minBullets === "number") {
    failIf(
      bulletTexts.length < fixture.expect.minBullets,
      failures,
      caseName,
      `Expected at least ${fixture.expect.minBullets} bullets, found ${bulletTexts.length}.`
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

  const companies = getPositionCompanies(parsed);
  for (const company of fixture.expect.companies ?? []) {
    failIf(
      !companies.some((actual) => includesLoose(actual, company)),
      failures,
      caseName,
      `Expected company "${company}". Parsed companies: ${companies.join(" | ") || "(none)"}.`
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

  const skills = getRawAndNormalizedSkills(parsed);
  for (const skill of fixture.expect.skills ?? []) {
    failIf(
      !skills.some((actual) => includesLoose(actual, skill)),
      failures,
      caseName,
      `Expected skill "${skill}". Parsed skills: ${skills.join(", ") || "(none)"}.`
    );
  }

  return failures;
}

function printSuccessSummary() {
  console.log(`Resume parser validation passed (${fixtures.length} fixture cases).`);
  for (const fixture of fixtures) {
    const parsed = parseResumeDocument(fixture.text, {
      sourceFileName: fixture.sourceFileName,
      sourceMimeType: fixture.sourceMimeType,
      extractor: "plain_text",
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

function main() {
  const failures = fixtures.flatMap(assertFixture);

  if (failures.length) {
    console.error(`Resume parser validation failed with ${failures.length} issue(s):`);
    for (const failure of failures) {
      console.error(`\n[${failure.caseName}]\n${failure.message}`);
    }

    console.error("\nFix only deterministic parser behavior inside JOB-138 scope.");
    process.exit(1);
  }

  printSuccessSummary();
}

main();
