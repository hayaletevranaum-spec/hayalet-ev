function normalizeCanonicalString(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function isUnsupportedValue(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

function canonicalizeValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || isUnsupportedValue(value)) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(normalizeCanonicalString(value));
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (Number.isFinite(value) === false) {
      return "null";
    }
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }

  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }

  if (typeof value !== "object") {
    return "null";
  }

  if (ancestors.has(value)) {
    throw new TypeError("Pattern Room case review hash input must not contain cycles.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalizeValue(item, ancestors)).join(",")}]`;
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => isUnsupportedValue(record[key]) === false)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => {
        return `${JSON.stringify(key)}:${canonicalizeValue(record[key], ancestors)}`;
      });
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizePatternRoomCaseReviewValue(value: unknown): string {
  return canonicalizeValue(value, new Set<object>());
}

export function createPatternRoomCaseReviewHash(value: unknown): string {
  const canonicalValue = canonicalizePatternRoomCaseReviewValue(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < canonicalValue.length; index += 1) {
    const codeUnit = canonicalValue.charCodeAt(index);
    hash ^= codeUnit & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= codeUnit >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}
