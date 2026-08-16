type LaboratoryHostUtilsRecord = Record<string, unknown>;

type LaboratoryHostUtilsDeps = {
  audioFeatureId: string;
  getDefaultSourceType: (sourcePresets: LaboratoryHostUtilsRecord) => string;
  toRecord: (value: unknown) => LaboratoryHostUtilsRecord;
};

export function sanitizeLaboratoryFileSegment(value: unknown, fallback: string): string {
  const baseValue =
    typeof value === "string" && value.trim() !== "" ? value : fallback || "artifact";
  const normalized = baseValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback || "artifact";
}

export function toLaboratoryFfmpegTimestamp(seconds: unknown, fallback: string | null): string {
  const numericValue = Number(seconds);
  if (Number.isFinite(numericValue) !== true || numericValue < 0) {
    return fallback || "0";
  }
  return numericValue.toFixed(3);
}

export function createLaboratoryHostUtils(deps: LaboratoryHostUtilsDeps) {
  const { audioFeatureId, getDefaultSourceType, toRecord } = deps;

  function getPreferredFeatureSourceKind(
    featureId: string,
    sourcePresets: LaboratoryHostUtilsRecord
  ): string {
    const sourceTypes = toRecord(toRecord(sourcePresets)["sourceTypes"]);
    if (
      featureId === audioFeatureId &&
      Object.prototype.hasOwnProperty.call(sourceTypes, "audio")
    ) {
      return "audio";
    }
    return getDefaultSourceType(sourcePresets);
  }

  function toFileUrl(filePath: string | null | undefined): string | null {
    if (typeof filePath !== "string" || filePath.trim() === "") {
      return null;
    }

    const normalized = filePath.trim().replace(/\\/g, "/");
    const url = new URL("file:///");
    url.pathname = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return url.toString();
  }

  function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) !== true) {
      return fallback;
    }
    return Math.min(maximum, Math.max(minimum, numericValue));
  }

  return {
    clampNumber,
    getPreferredFeatureSourceKind,
    sanitizeFileSegment: sanitizeLaboratoryFileSegment,
    toFileUrl,
    toFfmpegTimestamp: toLaboratoryFfmpegTimestamp,
  };
}
