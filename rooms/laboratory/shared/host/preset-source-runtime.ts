type LaboratoryRecord = Record<string, unknown>;

type LaboratorySourceMetadata = {
  audioCodec: string | null;
  bitRate: number | null;
  codec: string | null;
  durationSeconds: number | null;
  extractedAt: string | null;
  extractedBy: string | null;
  formatName: string | null;
  height: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
  streamCount: number | null;
  videoCodec: string | null;
  width: number | null;
};

type LaboratorySourceDrafts = {
  urlInput: string;
  youtubeCustom: LaboratoryRecord;
  youtubePreset: string;
  youtubeUrl: string;
};

type LaboratoryPresetSourceRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  clone: <T>(value: T) => T;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryPresetSourceRuntime(deps: LaboratoryPresetSourceRuntimeDeps) {
  const { asNonEmptyString, clone, toRecord } = deps;

  function asNumber(value: unknown): number | null {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : null;
  }

  function normalizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .map(function (entry: unknown) {
            return asNonEmptyString(entry);
          })
          .filter(function (entry): entry is string {
            return typeof entry === "string" && entry.length > 0;
          })
      : [];
  }

  function normalizeSourceMetadata(rawValue: unknown): LaboratorySourceMetadata | null {
    const source = toRecord(rawValue);
    const normalized: LaboratorySourceMetadata = {
      durationSeconds: asNumber(source["durationSeconds"]),
      width: asNumber(source["width"]),
      height: asNumber(source["height"]),
      codec: asNonEmptyString(source["codec"]),
      videoCodec: asNonEmptyString(source["videoCodec"]),
      audioCodec: asNonEmptyString(source["audioCodec"]),
      formatName: asNonEmptyString(source["formatName"]),
      bitRate: asNumber(source["bitRate"]),
      sizeBytes: asNumber(source["sizeBytes"]),
      streamCount: asNumber(source["streamCount"]),
      mimeType: asNonEmptyString(source["mimeType"]),
      extractedBy: asNonEmptyString(source["extractedBy"]),
      extractedAt: asNonEmptyString(source["extractedAt"]),
    };

    const hasValue = Object.values(normalized).some(function (value: string | number | null) {
      return value !== null;
    });

    return hasValue ? normalized : null;
  }

  function pad2(value: number | string): string {
    return String(value).padStart(2, "0");
  }

  function buildProjectName(dateValue: string | number | Date): string {
    const date = new Date(dateValue);
    return `Lab Session ${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
      date.getDate()
    )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function buildProjectSlug(dateValue: string | number | Date): string {
    const date = new Date(dateValue);
    return [
      "lab-session",
      `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`,
      `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`,
    ].join("-");
  }

  function getSourceConfig(sourcePresets: unknown, kind: string): LaboratoryRecord {
    const presets = toRecord(sourcePresets);
    const sourceTypes = toRecord(presets["sourceTypes"]);
    return toRecord(sourceTypes[kind]);
  }

  function getDefaultSourceType(sourcePresets: unknown): string {
    const presets = toRecord(sourcePresets);
    const sourceType = asNonEmptyString(presets["defaultSourceType"]);
    return sourceType || "video";
  }

  function getDefaultMode(sourcePresets: unknown, kind: string): string {
    const config = getSourceConfig(sourcePresets, kind);
    return asNonEmptyString(config["defaultMode"]) || "local";
  }

  function getDefaultYoutubePreset(sourcePresets: unknown): string {
    const presets = toRecord(sourcePresets);
    const youtubePresets = toRecord(presets["youtubePresets"]);
    return youtubePresets["medium"] ? "medium" : youtubePresets["custom"] ? "custom" : "low";
  }

  function getPresetDefaultCustomValues(
    sourcePresets: unknown,
    presetId: string
  ): LaboratoryRecord {
    const presets = toRecord(sourcePresets);
    const youtubePresets = toRecord(presets["youtubePresets"]);
    const preset = toRecord(youtubePresets[presetId]);
    return clone(toRecord(preset["defaultCustomValues"]));
  }

  function createEmptySourceDrafts(sourcePresets: unknown): LaboratorySourceDrafts {
    const defaultPreset = getDefaultYoutubePreset(sourcePresets);
    return {
      urlInput: "",
      youtubeUrl: "",
      youtubePreset: defaultPreset,
      youtubeCustom: getPresetDefaultCustomValues(sourcePresets, defaultPreset),
    };
  }

  return {
    asNumber,
    normalizeStringArray,
    normalizeSourceMetadata,
    buildProjectName,
    buildProjectSlug,
    getSourceConfig,
    getDefaultSourceType,
    getDefaultMode,
    getDefaultYoutubePreset,
    getPresetDefaultCustomValues,
    createEmptySourceDrafts,
  };
}
