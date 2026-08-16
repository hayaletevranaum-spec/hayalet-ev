import type { LabInteractiveSettings } from "../domain/lab-types.js";

export const DEFAULT_LAB_INTERACTIVE_SETTINGS: LabInteractiveSettings = {
  brightness: 100,
  contrast: 100,
  gamma: 1.0,
  saturation: 100,
  hueRotate: 0,
  sharpness: 100,
  channelR: true,
  channelG: true,
  channelB: true,
  edgeHighlight: false,
  invert: false,
};

function readFiniteSetting(
  record: Record<string, unknown>,
  key: keyof LabInteractiveSettings,
  fallback: number
) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBooleanSetting(
  record: Record<string, unknown>,
  key: keyof LabInteractiveSettings,
  fallback: boolean
) {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeLabInteractiveSettings(
  value: unknown,
  fallback: LabInteractiveSettings = DEFAULT_LAB_INTERACTIVE_SETTINGS
): LabInteractiveSettings {
  const record =
    value && typeof value === "object" && Array.isArray(value) === false
      ? (value as Record<string, unknown>)
      : {};
  return {
    brightness: readFiniteSetting(record, "brightness", fallback.brightness),
    channelB: readBooleanSetting(record, "channelB", fallback.channelB),
    channelG: readBooleanSetting(record, "channelG", fallback.channelG),
    channelR: readBooleanSetting(record, "channelR", fallback.channelR),
    contrast: readFiniteSetting(record, "contrast", fallback.contrast),
    edgeHighlight: readBooleanSetting(record, "edgeHighlight", fallback.edgeHighlight),
    gamma: readFiniteSetting(record, "gamma", fallback.gamma),
    hueRotate: readFiniteSetting(record, "hueRotate", fallback.hueRotate),
    invert: readBooleanSetting(record, "invert", fallback.invert),
    saturation: readFiniteSetting(record, "saturation", fallback.saturation),
    sharpness: readFiniteSetting(record, "sharpness", fallback.sharpness),
  };
}

export function createLabComparisonInteractiveSettings(
  base: LabInteractiveSettings = DEFAULT_LAB_INTERACTIVE_SETTINGS
) {
  const settings = normalizeLabInteractiveSettings(base);
  return {
    primary: { ...settings },
    reference: { ...settings },
  };
}
