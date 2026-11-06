const BULLET_GLYPH_RE = /^[\s\t]*[•●▪◦‣·*-]+\s+/;
const MULTI_SPACE = /[\t \u00a0]+/g;
const CONNECTOR_END_RE = /\b(?:and|or|with|using|to|for|by|in|across|including|supporting|improving|reducing|increasing|through|via|into|from|while)\s*$/i;
const ROLE_HEADER_RE = /\b(?:engineer|developer|designer|producer|manager|analyst|tester|auditor|specialist|coordinator|intern|lead|director|consultant|administrator|master)\b/i;
const SECTION_HEADING_RE =
  /^(?:profile|summary|professional summary|objective|skills|technical skills|core skills|areas of expertise|experience|job experience|work experience|professional experience|employment history|education|certifications?|projects|interests)\b/i;

export type NormalizedResumeText = {
  plainText: string;
  lines: string[];
};

function normalizeDashVariants(input: string) {
  return input
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/â€”|â€“/g, "-")
    .replace(/â€"/g, "-")
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€|Ã¢â‚¬â€"|Ã¢â‚¬â€œ/g, "-");
}

function normalizeCommonMojibake(input: string) {
  return input
    .replace(/â€¢|â—¦|ï‚§|â-ª/g, "•")
    .replace(/Ã¢â‚¬Â¢|Ã¯â€šÂ§|Ã¢â€“Âª|Ã¢â€”Â¦/g, "•")
    .replace(/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢|ÃƒÆ’Ã‚Â¯ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â·|ÃƒÂ¯Ã¢â‚¬Å¡Ã‚Â·|ÃƒÂ¢Ã¢â‚¬â€Ã‚Â/g, "•")
    .replace(/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“Ãƒâ€šÃ‚Âª|ÃƒÂ¢Ã¢â‚¬â€œÃ‚Âª|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â£|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â£|ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬â€Ãƒâ€šÃ‚Â¦|ÃƒÂ¢Ã¢â‚¬â€Ã‚Â¦/g, "•")
    .replace(/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢|ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“/g, "'")
    .replace(/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚Â|ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â/g, '"');
}

function normalizeBulletLine(line: string) {
  const trimmed = normalizeCommonMojibake(line).replace(MULTI_SPACE, " ").trim();
  if (!trimmed) return "";
  if (BULLET_GLYPH_RE.test(trimmed)) {
    return trimmed.replace(BULLET_GLYPH_RE, "• ").trim();
  }
  return trimmed;
}

function looksLikeStandaloneHeader(line: string) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("• ")) return false;
  if (SECTION_HEADING_RE.test(trimmed)) return true;
  if (/^[A-Z][A-Z /&+-]{2,50}$/.test(trimmed)) return true;
  if (/\b(?:19|20)\d{2}\b/.test(trimmed) && ROLE_HEADER_RE.test(trimmed)) return true;
  if (/^[A-Z][A-Za-z0-9 '&/.,+-]{2,90}\s*[|,-]\s*[A-Z][A-Za-z0-9 '&/.,+-]{2,90}\s*[|,-]\s*(?:\d{1,2}\/)?(?:19|20)\d{2}/.test(trimmed)) {
    return true;
  }
  return false;
}

function shouldJoinWrappedLine(previous: string, current: string) {
  if (!previous || !current) return false;
  if (current.startsWith("• ")) return false;
  if (looksLikeStandaloneHeader(previous)) return false;
  if (looksLikeStandaloneHeader(current)) return false;
  if (/^[A-Z][A-Z /&+-]{2,50}$/.test(previous)) return false;
  if (/^[A-Z][A-Z /&+-]{2,50}$/.test(current)) return false;
  if (/[.!?;:]$/.test(previous)) return false;
  if (/\b(19|20)\d{2}\b/.test(previous) && /\b(19|20)\d{2}\b/.test(current) && ROLE_HEADER_RE.test(current)) return false;

  if (CONNECTOR_END_RE.test(previous)) return true;
  if (/^[a-z(~\d]/.test(current)) return true;
  if (previous.startsWith("• ") && previous.length >= 35 && current.length <= 120) return true;
  if (previous.length >= 50 && /^[A-Z][a-z]/.test(current) && !ROLE_HEADER_RE.test(current)) return true;

  return false;
}

export function normalizeResumeTextForParsing(rawText: unknown): NormalizedResumeText {
  const source = normalizeDashVariants(
    normalizeCommonMojibake(String(rawText ?? ""))
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00ad/g, "")
      .replace(/\t+/g, "\n")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/│/g, " | ")
  );

  const preliminaryLines = source
    .split("\n")
    .map((line) => normalizeBulletLine(line))
    .map((line) => line.replace(/\s+to\s+/gi, " to "))
    .filter((line, index, all) => {
      if (line) return true;
      return index > 0 && all[index - 1] !== "";
    });

  const rebuilt: string[] = [];
  for (const line of preliminaryLines) {
    if (!line) {
      if (rebuilt[rebuilt.length - 1] !== "") rebuilt.push("");
      continue;
    }

    const previous = rebuilt[rebuilt.length - 1] || "";
    if (previous && shouldJoinWrappedLine(previous, line)) {
      rebuilt[rebuilt.length - 1] = `${previous} ${line}`.replace(MULTI_SPACE, " ").trim();
      continue;
    }

    rebuilt.push(line);
  }

  const lines = rebuilt
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd());

  return {
    plainText: lines.join("\n").trim(),
    lines: lines.filter((line) => line.trim().length > 0),
  };
}

export function stripInternalBulletMarker(text: string) {
  return normalizeCommonMojibake(String(text || "")).replace(BULLET_GLYPH_RE, "").replace(/^•\s+/, "").trim();
}

export function normalizeForLooseCompare(text: string) {
  return normalizeCommonMojibake(String(text || ""))
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
