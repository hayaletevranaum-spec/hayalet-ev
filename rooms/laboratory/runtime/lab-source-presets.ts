import { asLabRecord, asNonEmptyString } from "../domain/lab-types.js";
import type { LabStoreState } from "../domain/lab-types.js";

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function toSourcePresetKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSourcePresets(state: LabStoreState) {
  return asLabRecord(asLabRecord(state.snapshot)["sourcePresets"]);
}

export function getSourceTypePreset(state: LabStoreState, kind: unknown) {
  const sourcePresets = getSourcePresets(state);
  const sourceTypes = asLabRecord(sourcePresets["sourceTypes"]);
  return asLabRecord(sourceTypes[toSourcePresetKey(kind)]);
}

export function getSourceKindOptions(state: LabStoreState): string[] {
  const sourceTypes = asLabRecord(getSourcePresets(state)["sourceTypes"]);
  const configuredKinds = Object.keys(sourceTypes).filter(function (entry) {
    return entry.trim() !== "";
  });
  return configuredKinds.length > 0 ? configuredKinds : ["video", "audio", "image"];
}

export function getSourceModeOptions(state: LabStoreState, kind: unknown): string[] {
  const sourceConfig = getSourceTypePreset(state, kind);
  const configuredModes = toStringArray(sourceConfig["modes"]);
  return configuredModes.length > 0 ? configuredModes : ["local"];
}

export function getDefaultSourceMode(state: LabStoreState, kind: unknown): string {
  const sourceConfig = getSourceTypePreset(state, kind);
  const configuredDefault = asNonEmptyString(sourceConfig["defaultMode"]);
  if (configuredDefault) {
    return configuredDefault;
  }
  return getSourceModeOptions(state, kind)[0] || "local";
}

export function getDefaultSourceKind(state: LabStoreState): string {
  const sourcePresets = getSourcePresets(state);
  const configuredDefault = asNonEmptyString(sourcePresets["defaultSourceType"]);
  if (configuredDefault) {
    return configuredDefault;
  }
  return getSourceKindOptions(state)[0] || "video";
}

export function getDefaultYoutubePreset(state: LabStoreState): string {
  const sourcePresets = getSourcePresets(state);
  const presets = asLabRecord(sourcePresets["youtubePresets"]);
  if (asLabRecord(presets)["medium"]) {
    return "medium";
  }
  if (asLabRecord(presets)["custom"]) {
    return "custom";
  }
  return Object.keys(presets)[0] || "medium";
}

export function getYoutubePresetDefaults(state: LabStoreState, presetId: string | null) {
  const sourcePresets = getSourcePresets(state);
  const presets = asLabRecord(sourcePresets["youtubePresets"]);
  const resolvedPresetId = presetId || getDefaultYoutubePreset(state);
  return asLabRecord(asLabRecord(presets[resolvedPresetId])["defaultCustomValues"]);
}
