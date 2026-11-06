import {
  PrismaClient,
  RemoteType,
  EmploymentType,
  SeniorityLevel,
  JobStatus,
} from "@prisma/client";
import jobs from "../data/jobs.seed.json";

const prisma = new PrismaClient();

type SeedJob = {
  externalId: string;
  title: string;
  company: string;
  location?: string | null;
  remoteType?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  postedAt?: string | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  description: string;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function extractKeywords(text: string) {
  const cleaned = String(text || "").toLowerCase();
  const shortlist = [
    "selenium",
    "playwright",
    "cypress",
    "typescript",
    "javascript",
    "react",
    "next.js",
    "node.js",
    "node",
    "postgresql",
    "sql",
    "prisma",
    "api",
    "testing",
    "automation",
    "ci/cd",
    "docker",
    "kubernetes",
    "terraform",
    "aws",
    "linux",
    "jira",
    "agile",
    "dbt",
    "python",
    "support",
    "incident",
    "observability",
    "product",
    "analytics",
    "producer",
    "game producer",
    "development producer",
    "associate producer",
    "production coordinator",
    "project coordinator",
    "product owner",
    "technical product owner",
    "agile product owner",
    "scrum po",
    "backlog",
    "user stories",
    "acceptance criteria",
    "narrative writer",
    "game writer",
    "interactive writer",
    "narrative designer",
    "quest writer",
    "dialogue",
    "lore",
    "story",
  ];

  return shortlist.filter((term) => cleaned.includes(term));
}

function extractSkills(text: string) {
  return extractKeywords(text);
}

function toRemoteType(value: string | null | undefined): RemoteType {
  const normalized = normalizeText(value);

  switch (normalized) {
    case "remote":
      return RemoteType.remote;
    case "hybrid":
      return RemoteType.hybrid;
    case "onsite":
    case "on-site":
    case "on site":
      return RemoteType.onsite;
    default:
      return RemoteType.unknown;
  }
}

function toEmploymentType(value: string | null | undefined): EmploymentType {
  const normalized = normalizeText(value);

  switch (normalized) {
    case "full_time":
    case "full-time":
    case "full time":
      return EmploymentType.full_time;
    case "part_time":
    case "part-time":
    case "part time":
      return EmploymentType.part_time;
    case "contract":
      return EmploymentType.contract;
    case "temporary":
      return EmploymentType.temporary;
    case "internship":
      return EmploymentType.internship;
    default:
      return EmploymentType.full_time;
  }
}

function toSeniorityLevel(value: string | null | undefined): SeniorityLevel {
  const normalized = normalizeText(value);

  switch (normalized) {
    case "entry":
      return SeniorityLevel.entry;
    case "junior":
      return SeniorityLevel.junior;
    case "mid":
      return SeniorityLevel.mid;
    case "senior":
      return SeniorityLevel.senior;
    case "lead":
      return SeniorityLevel.lead;
    case "manager":
      return SeniorityLevel.manager;
    default:
      return SeniorityLevel.mid;
  }
}

async function main() {
  const source = await prisma.jobSource.upsert({
    where: { slug: "seed" },
    update: {
      name: "Seed Jobs",
      kind: "manual",
      isActive: true,
    },
    create: {
      slug: "seed",
      name: "Seed Jobs",
      kind: "manual",
      isActive: true,
    },
  });

  let inserted = 0;
  let updated = 0;

  for (const raw of jobs as SeedJob[]) {
    const payload = {
      sourceId: source.id,
      externalId: raw.externalId,
      company: raw.company,
      companyNormalized: normalizeText(raw.company),
      title: raw.title,
      titleNormalized: normalizeText(raw.title),
      location: raw.location ?? null,
      locationNormalized: raw.location ? normalizeText(raw.location) : null,
      remoteType: toRemoteType(raw.remoteType),
      employmentType: toEmploymentType(raw.employmentType),
      seniority: toSeniorityLevel(raw.seniority),
      salaryMin: raw.salaryMin ?? null,
      salaryMax: raw.salaryMax ?? null,
      salaryCurrency: raw.salaryCurrency ?? null,
      description: raw.description,
      requirementsText: raw.description,
      responsibilitiesText: raw.description,
      skills: extractSkills(raw.description),
      keywords: extractKeywords(raw.description),
      postedAt: raw.postedAt ? new Date(raw.postedAt) : null,
      applyUrl: raw.applyUrl ?? null,
      sourceUrl: raw.sourceUrl ?? null,
      rawPayload: raw,
      status: JobStatus.active,
    };

    const existing = await prisma.job.findFirst({
      where: {
        sourceId: source.id,
        externalId: raw.externalId,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.job.update({
        where: { id: existing.id },
        data: payload,
      });
      updated += 1;
    } else {
      await prisma.job.create({
        data: payload,
      });
      inserted += 1;
    }
  }

  console.log(
    `Seed import complete. Inserted: ${inserted}. Updated: ${updated}. Total input: ${(jobs as SeedJob[]).length}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
