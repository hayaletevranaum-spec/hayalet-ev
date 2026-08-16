import { createHash } from "crypto";

export function normalizeText(str: string | null | undefined): string {
  if (str === null || str === undefined || str.length === 0) return "";
  return str
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hashString(str: string | null | undefined): string {
  if (str === null || str === undefined || str.length === 0) return "0";

  const normalized = normalizeText(str);
  if (normalized.length === 0) return "0";

  return createHash("sha256").update(normalized).digest("hex");
}
