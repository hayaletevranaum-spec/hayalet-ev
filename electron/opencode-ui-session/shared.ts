import type { JsonRecord } from "./types.ts";

export function asRecord(value: unknown): JsonRecord | null {
  if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return null;
}

export function parseRecord(raw: string): JsonRecord | null {
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asNullableTimestamp(value: unknown): number | null {
  const normalized = asNumber(value, Number.NaN);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

export function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function normalizeSlug(sessionId: string, title: string): string {
  const fromTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  if (fromTitle !== "") {
    return fromTitle.slice(0, 64);
  }

  const fromId = sessionId
    .toLowerCase()
    .replace(/^ses_/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  return fromId === "" ? `session-${Date.now().toString(36)}` : fromId.slice(0, 64);
}
