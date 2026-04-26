const BULLET_GLYPHS = /^(?:[\s\t]*(?:[â€¢â—ï‚§â–ªâ–«â—¦â€£âƒ*Â·â€§âˆ™â—¾â—½â– â–¡â—†â—‡â–ºâ–¸â–¹âž¤âžœâ†’â€ºÂ»âœ“âœ”â˜‘âœ…]|\-)+\s+)/;
const MULTI_SPACE = /[\t \u00a0]+/g;

export type NormalizedResumeText = {
  plainText: string;
  lines: string[];
};

function normalizeDashVariants(input: string) {
  return input.replace(/[â€â€‘â€’â€“â€”â€•]/g, "-");
}

function normalizeCommonMojibake(input: string) {
  return input
    .replace(/Ã¢â‚¬Â¢|Ã¯â€šÂ·|ï‚·|â—/g, "â€¢")
    .replace(/Ã¢â€“Âª|â–ª/g, "â€¢")
    .replace(/Ã¢â€”Â¦|â—¦/g, "â€¢")
    .replace(/Ã¢â‚¬Â£|â€£/g, "â€¢")
    .replace(/Ã¢Å“â€œ|Ã¢Å“â€/g, "â€¢")
    .replace(/Ã‚Â·/g, "â€¢");
}

function normalizeBulletLine(line: string) {
  const trimmed = normalizeCommonMojibake(line).replace(MULTI_SPACE, " ").trim();
  if (!trimmed) return "";

  if (BULLET_GLYPHS.test(trimmed)) {
    return trimmed.replace(BULLET_GLYPHS, "â€¢ ").trim();
  }

  return trimmed;
}

function shouldJoinWrappedLine(previous: string, current: string) {
  if (!previous || !current) return false;
  if (current.startsWith("â€¢ ")) return false;
  if (/^[A-Z][A-Za-z /&+-]{2,50}:$/.test(current)) return false;
  if (/^[A-Z][A-Z /&+-]{2,50}$/.test(current)) return false;
  if (/[.!?;:]$/.test(previous)) return false;
  if (/\b(19|20)\d{2}\b/.test(previous) && /\b(19|20)\d{2}\b/.test(current)) return false;
  if (previous.length < 35) return false;
  return /^[a-z(]/.test(current) || /^(and|or|with|while|to|for|by|in|using)\b/i.test(current);
}

export function normalizeResumeTextForParsing(rawText: unknown): NormalizedResumeText {
  const source = normalizeCommonMojibake(String(rawText ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00ad/g, "")
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'");

  const dashed = normalizeDashVariants(source);
  const preliminaryLines = dashed
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
    if (previous.startsWith("â€¢ ") && shouldJoinWrappedLine(previous, line)) {
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
  return normalizeCommonMojibake(String(text || "")).replace(BULLET_GLYPHS, "").replace(/^â€¢\s+/, "").trim();
}

export function normalizeForLooseCompare(text: string) {
  return normalizeCommonMojibake(String(text || ""))
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
