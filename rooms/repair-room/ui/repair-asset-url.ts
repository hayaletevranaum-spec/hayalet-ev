const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+\-.]*:|\/)/i;

function defaultBaseHref(): string {
  const location = (globalThis as { location?: Location }).location;
  return location === undefined ? "" : location.href;
}

export function resolveRepairAssetUrl(
  src: string | null | undefined,
  baseHref = defaultBaseHref()
): string | null {
  const normalized = typeof src === "string" ? src.trim() : "";
  if (normalized === "") return null;
  if (ABSOLUTE_URL_PATTERN.test(normalized)) return normalized;

  const runtimeRelative =
    normalized.startsWith("shared/") ||
    normalized.startsWith("main-functions/") ||
    normalized.startsWith("i18n/") ||
    normalized === "manifest.json";
  const relativeUrl = runtimeRelative ? `../${normalized}` : normalized;
  if (baseHref.trim() === "") return relativeUrl;

  try {
    return new URL(relativeUrl, baseHref).toString();
  } catch {
    return relativeUrl;
  }
}
