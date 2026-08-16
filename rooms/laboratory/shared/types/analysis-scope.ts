type AnalysisScopeRecord = Record<string, unknown>;

export type AnalysisFocus = "visual" | "audio" | "cross-modal";

export interface AnalysisTimeRange {
  startMs: number;
  endMs: number;
}

export interface AnalysisFrameRange {
  startFrame: number;
  endFrame: number;
}

export interface AnalysisRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AnalysisComparisonSide = "primary" | "reference";

export interface AnalysisComparisonTarget {
  side: AnalysisComparisonSide;
  assetId?: string;
  fileName?: string;
  label?: string;
  localPath?: string;
  metadata?: AnalysisScopeRecord;
  name?: string;
  path?: string;
  sourceId?: string;
  sourceKind?: "video" | "audio" | "image";
  type?: string;
  url?: string;
}

export interface AnalysisComparisonRois {
  activeSide?: AnalysisComparisonSide;
  primary?: AnalysisRegion | null;
  reference?: AnalysisRegion | null;
}

export interface AnalysisComparisonScope {
  activeSide?: AnalysisComparisonSide;
  primary: AnalysisComparisonTarget;
  reference: AnalysisComparisonTarget;
  rois?: AnalysisComparisonRois;
  splitPercent?: number;
  viewMode?: string;
}

export interface AnalysisReference {
  timeRange?: AnalysisTimeRange;
  frameRange?: AnalysisFrameRange;
  region?: AnalysisRegion;
}

export interface AnalysisScopeLifecycle {
  mutable: boolean;
  processId: string | null;
  frozenAt: string | null;
}

export interface AnalysisScope extends AnalysisReference {
  comparison?: AnalysisComparisonScope;
  focus?: AnalysisFocus;
  hypothesis?: string;
  lifecycle?: AnalysisScopeLifecycle;
}

function toRecord(value: unknown): AnalysisScopeRecord {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as AnalysisScopeRecord)
    : {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeStartEndRange(
  rawValue: unknown,
  startKey: string,
  endKey: string
): { start: number; end: number } | null {
  const source = toRecord(rawValue);
  const startValue = asFiniteNumber(source[startKey]);
  const endValue = asFiniteNumber(source[endKey]);
  if (startValue === null || endValue === null) {
    return null;
  }

  const start = Math.max(0, Math.round(Math.min(startValue, endValue)));
  const end = Math.max(start, Math.round(Math.max(startValue, endValue)));
  return { start, end };
}

function normalizeAnalysisRegion(rawValue: unknown): AnalysisRegion | null {
  const regionSource = toRecord(rawValue);
  const regionX = asFiniteNumber(regionSource["x"]);
  const regionY = asFiniteNumber(regionSource["y"]);
  const regionWidth = asFiniteNumber(regionSource["width"]);
  const regionHeight = asFiniteNumber(regionSource["height"]);
  if (regionX === null || regionY === null || regionWidth === null || regionHeight === null) {
    return null;
  }
  return {
    x: Math.max(0, Math.round(regionX || 0)),
    y: Math.max(0, Math.round(regionY || 0)),
    width: Math.max(1, Math.round(regionWidth || 0)),
    height: Math.max(1, Math.round(regionHeight || 0)),
  };
}

export function normalizeAnalysisReference(rawValue: unknown): AnalysisReference | null {
  const source = toRecord(rawValue);
  const timeRange = normalizeStartEndRange(source["timeRange"], "startMs", "endMs");
  const frameRange = normalizeStartEndRange(source["frameRange"], "startFrame", "endFrame");
  const region = normalizeAnalysisRegion(source["region"]);

  if (timeRange === null && frameRange === null && region === null) {
    return null;
  }

  return {
    ...(timeRange
      ? {
          timeRange: {
            startMs: timeRange.start,
            endMs: timeRange.end,
          },
        }
      : {}),
    ...(frameRange
      ? {
          frameRange: {
            startFrame: frameRange.start,
            endFrame: frameRange.end,
          },
        }
      : {}),
    ...(region ? { region } : {}),
  };
}

function normalizeComparisonSide(value: unknown): AnalysisComparisonSide | null {
  return value === "primary" || value === "reference" ? value : null;
}

function normalizeComparisonTarget(
  rawValue: unknown,
  fallbackSide: AnalysisComparisonSide
): AnalysisComparisonTarget | null {
  const source = toRecord(rawValue);
  const side = normalizeComparisonSide(source["side"]) || fallbackSide;
  const assetId = asNonEmptyString(source["assetId"]);
  const fileName = asNonEmptyString(source["fileName"]);
  const label = asNonEmptyString(source["label"]);
  const localPath = asNonEmptyString(source["localPath"]);
  const metadata = toRecord(source["metadata"]);
  const name = asNonEmptyString(source["name"]);
  const path = asNonEmptyString(source["path"]);
  const sourceId = asNonEmptyString(source["sourceId"]);
  const sourceKind = asNonEmptyString(source["sourceKind"]);
  const type = asNonEmptyString(source["type"]);
  const url = asNonEmptyString(source["url"]);
  const target: AnalysisComparisonTarget = {
    side,
    ...(assetId ? { assetId } : {}),
    ...(fileName ? { fileName } : {}),
    ...(label ? { label } : {}),
    ...(localPath ? { localPath } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(name ? { name } : {}),
    ...(path ? { path } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(sourceKind === "video" || sourceKind === "audio" || sourceKind === "image"
      ? { sourceKind }
      : {}),
    ...(type ? { type } : {}),
    ...(url ? { url } : {}),
  };
  if (
    target.assetId === undefined &&
    target.fileName === undefined &&
    target.label === undefined &&
    target.localPath === undefined &&
    target.name === undefined &&
    target.path === undefined &&
    target.url === undefined
  ) {
    return null;
  }
  return target;
}

function normalizeComparisonRois(rawValue: unknown): AnalysisComparisonRois | null {
  const source = toRecord(rawValue);
  const activeSide = normalizeComparisonSide(source["activeSide"]);
  const primary = normalizeAnalysisRegion(source["primary"]);
  const reference = normalizeAnalysisRegion(source["reference"]);
  if (activeSide === null && primary === null && reference === null) {
    return null;
  }
  return {
    ...(activeSide ? { activeSide } : {}),
    ...(primary === null ? {} : { primary }),
    ...(reference === null ? {} : { reference }),
  };
}

export function normalizeAnalysisComparisonScope(
  rawValue: unknown
): AnalysisComparisonScope | null {
  const source = toRecord(rawValue);
  const primary = normalizeComparisonTarget(source["primary"], "primary");
  const reference = normalizeComparisonTarget(source["reference"], "reference");
  if (primary === null || reference === null) {
    return null;
  }
  const activeSide = normalizeComparisonSide(source["activeSide"]);
  const rois = normalizeComparisonRois(source["rois"]);
  const splitPercent = asFiniteNumber(source["splitPercent"]);
  const viewMode = asNonEmptyString(source["viewMode"]);
  return {
    ...(activeSide ? { activeSide } : {}),
    primary,
    reference,
    ...(rois ? { rois } : {}),
    ...(splitPercent === null ? {} : { splitPercent: Math.max(0, Math.min(100, splitPercent)) }),
    ...(viewMode ? { viewMode } : {}),
  };
}

export function normalizeAnalysisScope(rawValue: unknown): AnalysisScope | null {
  const source = toRecord(rawValue);
  const reference = normalizeAnalysisReference(source);
  const comparison = normalizeAnalysisComparisonScope(source["comparison"]);
  const focus = asNonEmptyString(source["focus"]);
  const hypothesis = asNonEmptyString(source["hypothesis"]);
  const lifecycleSource = toRecord(source["lifecycle"]);
  const lifecycle =
    Object.keys(lifecycleSource).length > 0 ||
    hypothesis !== null ||
    focus !== null ||
    comparison !== null ||
    reference !== null
      ? {
          mutable: lifecycleSource["mutable"] !== false,
          processId: asNonEmptyString(lifecycleSource["processId"]),
          frozenAt: asNonEmptyString(lifecycleSource["frozenAt"]),
        }
      : null;

  if (
    reference === null &&
    comparison === null &&
    hypothesis === null &&
    focus === null &&
    lifecycle === null
  ) {
    return null;
  }

  return {
    ...(reference || {}),
    ...(comparison ? { comparison } : {}),
    ...(focus && (focus === "visual" || focus === "audio" || focus === "cross-modal")
      ? { focus }
      : {}),
    ...(hypothesis ? { hypothesis } : {}),
    ...(lifecycle ? { lifecycle } : {}),
  };
}

export function freezeAnalysisScope(
  rawValue: unknown,
  processId: string | null,
  frozenAt: string = new Date().toISOString()
): AnalysisScope | null {
  const normalized = normalizeAnalysisScope(rawValue);
  if (normalized === null) {
    return null;
  }

  return {
    ...normalized,
    lifecycle: {
      mutable: false,
      processId,
      frozenAt,
    },
  };
}

export function serializeAnalysisScope(rawValue: unknown): AnalysisScopeRecord | null {
  const normalized = normalizeAnalysisScope(rawValue);
  if (normalized === null) {
    return null;
  }
  return JSON.parse(JSON.stringify(normalized)) as AnalysisScopeRecord;
}
