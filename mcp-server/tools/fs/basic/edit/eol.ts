import type { EOLMode } from "./types.js";

export function detectEOL(content: string): "lf" | "crlf" {
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) ?? []).length;
  return crlfCount > lfCount ? "crlf" : "lf";
}

export function normalizeEOL(content: string, mode: EOLMode): string {
  if (mode === "preserve") return content;
  const target = mode === "auto" ? detectEOL(content) : mode;
  const normalized = content.replace(/\r\n/g, "\n");
  return target === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}
