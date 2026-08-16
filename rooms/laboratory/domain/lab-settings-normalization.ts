import type { LabSettingsRecord } from "./lab-capabilities.js";

export function cloneSettingsRecord(record: LabSettingsRecord): LabSettingsRecord {
  return { ...record };
}

export function pickOption(value: unknown, options: readonly string[], fallback: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return options.includes(normalized) ? normalized : fallback;
}

export function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function pickNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  step = 1
): number {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const numeric = Number.isFinite(raw) ? raw : fallback;
  const clamped = Math.max(min, Math.min(max, numeric));
  const stepped = step > 0 ? Math.round(clamped / step) * step : clamped;
  const [, decimal = ""] = String(step).split(".");
  return Number(stepped.toFixed(Math.min(6, decimal.length + 2)));
}
