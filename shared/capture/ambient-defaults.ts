export const DEFAULT_AMBIENT_WAKE_PHRASES = ["Hey Jarvis"] as const;
export const DEFAULT_AMBIENT_ACTIVE_WINDOW_MS = 6_000;
export const DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS = 1_200;

export function normalizeAmbientWakePhrases(
  value: unknown,
  fallback: readonly string[] = DEFAULT_AMBIENT_WAKE_PHRASES
): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const phrases = source
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry !== "");
  const unique = [...new Set(phrases)];
  return unique.length > 0 ? unique : [...fallback];
}

export function normalizeAmbientDurationMs(
  value: unknown,
  fallback: number,
  bounds: { min: number; max: number }
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (Number.isFinite(numericValue) !== true) {
    return fallback;
  }
  const rounded = Math.round(numericValue);
  return Math.min(bounds.max, Math.max(bounds.min, rounded));
}
