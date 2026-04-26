import type { DetectedResumeSection, ParsedResumeContact } from "./types";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const LINK_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/|portfolio\.|[a-z0-9-]+\.[a-z]{2,})(?:\S*)/gi;

function looksLikeName(line: string) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.length > 60) return false;
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return false;
  if (/\d/.test(trimmed)) return false;
  if (/\b(resume|curriculum vitae|cv|email|phone|linkedin|github)\b/i.test(trimmed)) return false;
  return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(trimmed);
}

function inferLocation(lines: string[]) {
  return lines.find((line) => {
    const trimmed = line.trim();
    if (!trimmed || EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return false;
    if (/linkedin|github|http|www\./i.test(trimmed)) return false;
    return /,\s*[A-Z]{2}\b|,\s*[A-Za-z ]{3,}\b|\b(remote|canada|usa|united states)\b/i.test(trimmed);
  });
}

export function parseContact(sections: DetectedResumeSection[], allLines: string[]): ParsedResumeContact {
  const contactSection = sections.find((section) => section.kind === "contact");
  const searchLines = (contactSection?.lines.length ? contactSection.lines : allLines.slice(0, 8)).map((line) => line.trim()).filter(Boolean);

  const joined = searchLines.join("\n");
  const email = joined.match(EMAIL_RE)?.[0];
  const phone = joined.match(PHONE_RE)?.[0];
  const links = Array.from(joined.matchAll(LINK_RE)).map((match) => match[0]).filter((value) => !EMAIL_RE.test(value));
  const name = searchLines.find(looksLikeName);
  const location = inferLocation(searchLines);

  const signals = [email, phone, name, location, links.length ? links.join(",") : ""].filter(Boolean).length;

  return {
    name,
    email,
    phone,
    location,
    links: Array.from(new Set(links)),
    confidence: signals >= 3 ? "confident" : signals >= 2 ? "probable" : signals >= 1 ? "unlikely" : "very_unlikely",
  };
}

export function countContactSignals(contact: ParsedResumeContact) {
  return [contact.name, contact.email, contact.phone, contact.location, contact.links.length ? contact.links.join(",") : ""].filter(Boolean).length;
}
