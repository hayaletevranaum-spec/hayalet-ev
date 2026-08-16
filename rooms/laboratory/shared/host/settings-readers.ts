export type LaboratorySettingsRecord = Record<string, unknown>;

export function readStringSetting(
  settings: LaboratorySettingsRecord,
  key: string,
  fallback: string
): string {
  const value = settings[key];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function readNumberSetting(
  settings: LaboratorySettingsRecord,
  key: string,
  fallback: number
): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readBooleanSetting(
  settings: LaboratorySettingsRecord,
  key: string,
  fallback: boolean
): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}
