export function normalizeLocale(value: unknown): "tr" | "en" {
  return typeof value === "string" && value.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function translate(
  locale: unknown,
  group: Record<string, { en?: string; tr?: string } | undefined>,
  key: string
): string {
  const entry = group[key];
  if (!entry) {
    return "";
  }
  const normalizedLocale = normalizeLocale(locale);
  return entry[normalizedLocale] || entry.en || "";
}

export function fillTemplate(template: unknown, params: Record<string, unknown> = {}): string {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match: string, key: string) => {
    const value = Object.prototype.hasOwnProperty.call(params, key) ? params[key] : "";
    return String(value ?? "");
  });
}
