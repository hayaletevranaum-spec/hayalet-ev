export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    errors.push(`${key} must be a string`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    errors.push(`${key} cannot be empty`);
    return undefined;
  }
  return trimmed;
}

export function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): string | undefined {
  const value = readOptionalString(record, key, errors);
  if (value === undefined) {
    errors.push(`${key} is required`);
  }
  return value;
}

export function readFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || Number.isFinite(value) === false) {
    errors.push(`${key} must be a finite number`);
    return undefined;
  }
  return value;
}

export function readPositiveNumber(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): number | undefined {
  const value = readFiniteNumber(record, key, errors);
  if (value !== undefined && value <= 0) {
    errors.push(`${key} must be greater than 0`);
    return undefined;
  }
  return value;
}

export function hasDuplicateValues(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function isValidRoomId(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isValidRoomCommandName(value: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(value);
}

export function normalizeRoomRelativePath(value: string): string | null {
  const trimmed = value.replace(/\\/g, "/").trim();
  if (trimmed === "") {
    return null;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("../") || trimmed.includes("/../")) {
    return null;
  }
  const parts = trimmed.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }
  return parts.join("/");
}
