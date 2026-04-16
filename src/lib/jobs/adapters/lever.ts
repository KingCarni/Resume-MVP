import type { JobsAdapter, LeverPosting } from "@/lib/jobs/adapters/types";
import {
  classifySectionHeading,
  dedupeSections,
  dedupeTextBlocks,
  extractStructuredSections,
  fetchJson,
  inferFields,
  mergeSectionContents,
  normalizeHeading,
  normalizeJobShape,
  sanitizeTextBlock,
  shouldSuppressSection,
  stripHtml,
  type ParsedSection,
} from "@/lib/jobs/adapters/shared";

type LeverListResponse = LeverPosting[];

type LeverParsedDocument = {
  description: string;
  requirementsText: string | null;
  responsibilitiesText: string | null;
  parsedSections: ParsedSection[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function getString(record: UnknownRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function collectLeverBodyBlocks(posting: LeverPosting): Array<{ text: string; source: ParsedSection["source"] }> {
  const base = asRecord(posting as unknown);
  const descriptionRecord = asRecord(base?.descriptionParts ?? base?.descriptionData ?? null);

  const candidates: Array<{ value: string | null; source: ParsedSection["source"] }> = [
    { value: getString(base, "descriptionPlain"), source: "body_plain" },
    { value: getString(base, "description"), source: "body_html" },
    { value: getString(base, "descriptionBodyPlain"), source: "body_plain" },
    { value: getString(base, "descriptionBody"), source: "body_html" },
    { value: getString(base, "descriptionHtml"), source: "body_html" },
    { value: getString(base, "descriptionText"), source: "body_plain" },
    { value: getString(descriptionRecord, "bodyPlain"), source: "body_plain" },
    { value: getString(descriptionRecord, "body"), source: "body_html" },
    { value: getString(descriptionRecord, "descriptionPlain"), source: "body_plain" },
    { value: getString(descriptionRecord, "descriptionHtml"), source: "body_html" },
  ];

  return dedupeTextBlocks(
    candidates.map(({ value, source }) => {
      const cleaned = source === "body_html" ? stripHtml(value) : sanitizeTextBlock(value);
      return cleaned ? `${source}::${cleaned}` : null;
    })
  ).map((encoded) => {
    const splitIndex = encoded.indexOf("::");
    const source = encoded.slice(0, splitIndex) as ParsedSection["source"];
    const text = encoded.slice(splitIndex + 2);
    return { text, source };
  });
}

function sectionFromListItem(item: { text?: string | null; content?: string | null }): ParsedSection | null {
  const heading = item.text?.trim();
  const content = sanitizeTextBlock(stripHtml(item.content ?? ""));
  if (!content) return null;

  const bucket = heading ? classifySectionHeading(heading) : classifySectionHeading(content.split("\n")[0] ?? "");

  return {
    heading: heading || "Derived Section",
    bucket: bucket === "other" ? classifySectionHeading(content.split("\n")[0] ?? "") : bucket,
    content,
    source: "list",
    suppressed: false,
  };
}

function chooseOverviewSections(parsedSections: ParsedSection[], fallbackBlocks: string[]): ParsedSection[] {
  const explicitOverview = parsedSections.filter(
    (section) => !section.suppressed && (section.bucket === "overview" || (section.bucket === "other" && section.source !== "list"))
  );

  if (explicitOverview.length) return explicitOverview;

  return fallbackBlocks.slice(0, 2).map((content) => ({
    heading: "Role Overview",
    bucket: "overview",
    content,
    source: "derived" as const,
    suppressed: false,
  }));
}

function chooseRequirementSections(parsedSections: ParsedSection[]): ParsedSection[] {
  return parsedSections.filter(
    (section) => !section.suppressed && (section.bucket === "requirements" || section.bucket === "nice_to_have")
  );
}

function chooseResponsibilitySections(parsedSections: ParsedSection[]): ParsedSection[] {
  return parsedSections.filter((section) => !section.suppressed && section.bucket === "responsibilities");
}

function parseLeverSections(posting: LeverPosting): LeverParsedDocument {
  const bodyBlocks = collectLeverBodyBlocks(posting);

  const textSections = bodyBlocks.flatMap(({ text, source }) => extractStructuredSections(text, source));
  const listSections: ParsedSection[] = (posting.lists ?? [])
    .map((item) => sectionFromListItem({ text: item.text, content: item.content }))
    .filter((section): section is ParsedSection => Boolean(section));

  const parsedSections = dedupeSections([...textSections, ...listSections]).map((section) => ({
    ...section,
    suppressed: shouldSuppressSection(section),
  }));

  const fallbackBlocks = bodyBlocks.map((entry) => entry.text).filter(Boolean);
  const overviewSections = chooseOverviewSections(parsedSections, fallbackBlocks);
  const requirementSections = chooseRequirementSections(parsedSections);
  const responsibilitySections = chooseResponsibilitySections(parsedSections);

  const description = mergeSectionContents(overviewSections) ?? fallbackBlocks[0] ?? "";
  const requirementsText = mergeSectionContents(requirementSections);
  const responsibilitiesText = mergeSectionContents(responsibilitySections);

  return {
    description,
    requirementsText,
    responsibilitiesText,
    parsedSections,
  };
}

export const leverAdapter: JobsAdapter = {
  slug: "lever",

  async fetchJobs({ tokenOrSite, fetchImpl }) {
    const site = tokenOrSite.trim();

    if (!site) {
      throw new Error("Lever adapter requires a site slug.");
    }

    const pageSize = 100;
    let skip = 0;
    const collected: LeverPosting[] = [];

    while (true) {
      const url =
        `https://api.lever.co/v0/postings/${encodeURIComponent(site)}` +
        `?mode=json&limit=${pageSize}&skip=${skip}`;

      const batch = await fetchJson<LeverListResponse>(url, undefined, fetchImpl);

      collected.push(...batch);

      if (batch.length < pageSize) break;
      skip += pageSize;
    }

    const jobs = collected.map((posting) => {
      const location = posting.categories?.location || posting.categories?.allLocations?.join(" / ") || null;
      const parsed = parseLeverSections(posting);

      const inferred = inferFields({
        title: posting.text ?? "Untitled role",
        location,
        workplaceType: posting.workplaceType ?? null,
        commitment: posting.categories?.commitment ?? null,
        description: parsed.description,
        requirementsText: parsed.requirementsText,
        responsibilitiesText: parsed.responsibilitiesText,
      });

      const rawPayload = {
        ...posting,
        parsedSections: parsed.parsedSections,
      };

      return normalizeJobShape({
        sourceSlug: "lever",
        externalId: posting.id,
        title: posting.text ?? "Untitled role",
        company: site,
        location,
        remoteType: inferred.remoteType,
        employmentType: inferred.employmentType,
        seniority: inferred.seniority ?? posting.categories?.level ?? null,
        description: parsed.description,
        requirementsText: inferred.requirementsText,
        responsibilitiesText: inferred.responsibilitiesText,
        applyUrl: posting.applyUrl ?? null,
        sourceUrl: posting.hostedUrl ?? null,
        postedAt: null,
        salaryMin: posting.salaryRange?.min ?? null,
        salaryMax: posting.salaryRange?.max ?? null,
        salaryCurrency: posting.salaryRange?.currency ?? null,
        rawPayload,
      });
    });

    return {
      adapter: "lever",
      jobs,
      fetchedAt: new Date().toISOString(),
    };
  },
};
