import { readFile } from "node:fs/promises";

import { scoreResumeToJob } from "../lib/jobs/scoring";
import type { ResumeProfileInput } from "../lib/jobs/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const profileStrong: ResumeProfileInput = {
    id: "profile-strong",
    userId: "user-1",
    normalizedSkills: ["selenium", "playwright", "jira", "typescript", "api testing"],
    normalizedTitles: ["qa automation engineer", "qa engineer"],
    seniority: "senior",
    yearsExperience: 6,
    keywords: ["selenium", "playwright", "automation", "api testing", "typescript"],
    summary: "Senior QA automation engineer in Vancouver. Remote-friendly.",
  };

  const profileWeak: ResumeProfileInput = {
    id: "profile-weak",
    userId: "user-2",
    normalizedSkills: ["excel"],
    normalizedTitles: ["office assistant"],
    seniority: "junior",
    yearsExperience: 1,
    keywords: ["excel"],
    summary: "Onsite only.",
  };

  const job = {
    id: "job-1",
    title: "QA Automation Engineer",
    titleNormalized: "qa automation engineer",
    company: "Example Co",
    location: "Vancouver",
    locationNormalized: "vancouver",
    remoteType: "remote",
    seniority: "senior",
    skills: ["selenium", "playwright", "typescript"],
    keywords: ["selenium", "playwright", "automation", "typescript"],
  };

  const first = scoreResumeToJob(profileStrong, job);
  const second = scoreResumeToJob(profileStrong, job);
  const weak = scoreResumeToJob(profileWeak, job);

  assert(JSON.stringify(first) === JSON.stringify(second), "Scoring is not deterministic for identical inputs.");
  assert(first.totalScore >= weak.totalScore, "Stronger profile did not score at least as high as weaker profile.");
  assert(first.totalScore >= 0 && first.totalScore <= 100, "Strong profile score is out of bounds.");
  assert(weak.totalScore >= 0 && weak.totalScore <= 100, "Weak profile score is out of bounds.");
  assert(
    first.totalScore ===
      first.titleScore + first.skillScore + first.seniorityScore + first.keywordScore + first.locationScore,
    "Total score does not equal its score components."
  );
  assert(first.matchingSkills.includes("selenium"), "Expected matching skill not present.");
  assert(first.shortReasons.length > 0, "Expected at least one short reason for a strong match.");

  const scoringSource = await readFile(new URL("../lib/jobs/scoring.ts", import.meta.url), "utf8");
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/\bopenai\b/i, "openai import/reference found in scoring.ts"],
    [/\bchat\.completions\b/i, "chat.completions reference found in scoring.ts"],
    [/\bresponses\.create\b/i, "responses.create reference found in scoring.ts"],
    [/\baxios\b/i, "axios reference found in scoring.ts"],
    [/\bfetch\s*\(/i, "fetch() found in scoring.ts"],
  ];

  for (const [pattern, label] of forbiddenPatterns) {
    assert(!pattern.test(scoringSource), `Feed scoring must remain deterministic and LLM-free: ${label}`);
  }

  console.log("[PASS] scoring is deterministic for same inputs");
  console.log("[PASS] stronger profile outranks weaker profile for the same job");
  console.log("[PASS] score totals and reasons are internally consistent");
  console.log("[PASS] scoring.ts contains no obvious LLM/network dependency");
}

main().catch((error) => {
  console.error("[FAIL] validate-jobs-scoring.ts");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
