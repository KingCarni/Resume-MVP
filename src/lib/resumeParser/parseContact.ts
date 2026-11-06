import type { DetectedResumeSection, ParsedResumeContact } from "./types";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const LINK_RE = /\b(?:https?:\/\/\S+|www\.\S+|linkedin\.com\/\S*|github\.com\/\S*|[a-z0-9-]+\.(?:dev|io|ai|com|ca|net|org)\/\S*)/gi;
const CONTACT_WORD_RE = /\b(email|phone|mobile|linkedin|github|portfolio|website|resume|curriculum vitae|cv)\b/i;
const SECTION_WORD_RE = /\b(summary|experience|work experience|professional experience|employment history|job experience|education|skills|areas of expertise|projects|certifications)\b/i;

function splitCompositeLine(line: string) {
  return String(line || "")
    .split(/[\t|│]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeLoose(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeName(line: string) {
  const trimmed = normalizeLoose(line);
  if (!trimmed || trimmed.length > 60) return false;
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return false;
  if (CONTACT_WORD_RE.test(trimmed) || SECTION_WORD_RE.test(trimmed)) return false;
  if (/linkedin\.com|github\.com|https?:\/\/|www\./i.test(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;
  if (/[.!?]/.test(trimmed)) return false;

  const withoutSuffix = trimmed.replace(/,\s*[A-Za-z.]{2,10}$/, "");
  if (/^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}$/.test(withoutSuffix)) return true;
  if (/^[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+){1,3}(?:,\s*[A-Za-z.]{2,10})?$/.test(trimmed)) return true;
  return false;
}

function looksLikeLocation(line: string) {
  const trimmed = normalizeLoose(line);
  if (!trimmed || trimmed.length > 48) return false;
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return false;
  if (/linkedin\.com|github\.com|https?:\/\/|www\./i.test(trimmed)) return false;
  if (CONTACT_WORD_RE.test(trimmed) || SECTION_WORD_RE.test(trimmed)) return false;
  if (/[.!?]/.test(trimmed)) return false;
  return /,\s*(?:[A-Z]{2}|[A-Za-z ]{3,})$|\bremote\b|\bcanada\b|\busa\b|\bunited states\b/i.test(trimmed);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getSearchLines(contactSection: DetectedResumeSection | undefined, allLines: string[]) {
  const fromContact = (contactSection?.lines ?? []).map((line) => line.trim()).filter(Boolean);
  const firstLines = allLines.slice(0, 18).map((line) => line.trim()).filter(Boolean);
  const emailLineIndex = allLines.findIndex((line) => EMAIL_RE.test(line));
  const aroundEmail =
    emailLineIndex >= 0
      ? allLines.slice(Math.max(0, emailLineIndex - 3), Math.min(allLines.length, emailLineIndex + 4)).map((line) => line.trim()).filter(Boolean)
      : [];

  return unique([...fromContact, ...firstLines, ...aroundEmail]);
}

function pickName(searchLines: string[]) {
  for (const line of searchLines) {
    for (const part of splitCompositeLine(line)) {
      if (looksLikeName(part)) return part;
    }
    if (looksLikeName(line)) return line;
  }
  return undefined;
}

function inferLocation(searchLines: string[]) {
  return searchLines.find(looksLikeLocation);
}

export function parseContact(sections: DetectedResumeSection[], allLines: string[]): ParsedResumeContact {
  const contactSection = sections.find((section) => section.kind === "contact");
  const searchLines = getSearchLines(contactSection, allLines);
  const joined = searchLines.join("\n");

  const email = joined.match(EMAIL_RE)?.[0];
  const phone = joined.match(PHONE_RE)?.[0];
  const links = unique(
    Array.from(joined.matchAll(LINK_RE))
      .map((match) => match[0])
      .filter((value) => !EMAIL_RE.test(value))
      .map((value) => value.replace(/[),.;]+$/, ""))
  );

  const name = pickName(searchLines);
  const location = inferLocation(searchLines);
  const signals = [email, phone, name, location, links.length ? links.join(",") : ""].filter(Boolean).length;

  return {
    name,
    email,
    phone,
    location,
    links,
    confidence: signals >= 3 ? "confident" : signals >= 2 ? "probable" : signals >= 1 ? "unlikely" : "very_unlikely",
  };
}

export function countContactSignals(contact: ParsedResumeContact) {
  return [contact.name, contact.email, contact.phone, contact.location, contact.links.length ? contact.links.join(",") : ""].filter(Boolean).length;
}
