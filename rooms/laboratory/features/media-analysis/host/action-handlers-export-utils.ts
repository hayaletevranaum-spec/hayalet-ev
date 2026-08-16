import { deriveLabSourceId, findLabAssetById } from "../../../shared/host/lab-assets.js";
import { inferLabAssetSourceKind } from "../../../shared/lab-asset-kind.js";
import {
  readBooleanSetting,
  readNumberSetting,
  readStringSetting,
} from "../../../shared/host/settings-readers.js";
import { normalizeLabOperationSettings } from "../../../domain/lab-types.js";
import type {
  LabInteractiveSettings,
  LabAsset,
  LabOperationCapabilityId,
  LabSettingsRecord,
} from "../../../domain/lab-types.js";

export type LaboratoryRecord = Record<string, unknown>;

const OPERATION_CANCELLED_MESSAGE = "İşlem iptal edildi.";

export const MEDIA_EXPORT_ACTION_IDS = [
  "export-roi-image",
  "export-frame-grab",
  "export-enhanced-frame",
  "export-before-after-variant",
  "export-image-comparison",
  "export-timeline-clip",
  "export-stabilized-clip",
  "export-audio-track",
  "export-clean-audio",
  "export-band-pass-voice",
  "export-stem-separation",
] as const;

type MediaExportUtilityDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaExportUtilities(deps: MediaExportUtilityDeps) {
  const { asNonEmptyString, asNumber, pushJobState, toRecord } = deps;

  function getProjectId(project: LaboratoryRecord): string {
    return asNonEmptyString(project["id"]) || "";
  }

  function getSourceRecord(project: LaboratoryRecord): LaboratoryRecord {
    return toRecord(project["source"]);
  }

  function getAssetOperationPath(asset: LabAsset): string | null {
    return asNonEmptyString(asset.localPath);
  }

  function inferAssetSourceKind(asset: LabAsset, fallback: string): "video" | "audio" | "image" {
    const sourceKind = inferLabAssetSourceKind(asset);
    if (sourceKind !== null) {
      return sourceKind;
    }
    return fallback === "audio" || fallback === "image" ? fallback : "video";
  }

  function getWorkspaceTargetAssetId(payload: LaboratoryRecord) {
    return (
      asNonEmptyString(payload["workspaceTargetAssetId"]) ||
      asNonEmptyString(payload["targetAssetId"])
    );
  }

  function getWorkspaceTargetAsset(project: LaboratoryRecord, payload: LaboratoryRecord) {
    const assetId = getWorkspaceTargetAssetId(payload);
    return assetId === null ? null : findLabAssetById(project, assetId);
  }

  function getImportSourceIdForAsset(project: LaboratoryRecord, asset: LabAsset): string | null {
    const directSourceId =
      asNonEmptyString(asset.sourceId) || asNonEmptyString(asset.derivedFromSourceId);
    if (directSourceId !== null) {
      return directSourceId;
    }
    if (asset.type === "source") {
      return asNonEmptyString(asset.sourceId) || asset.id;
    }
    const parentAssetId = asNonEmptyString(asset.derivedFromAssetId);
    const parentAsset = parentAssetId === null ? null : findLabAssetById(project, parentAssetId);
    if (parentAsset?.type === "source") {
      return asNonEmptyString(parentAsset.sourceId) || parentAsset.id;
    }
    return null;
  }

  function getOperationSourceRecord(project: LaboratoryRecord, payload: LaboratoryRecord) {
    const source = getSourceRecord(project);
    const targetAssetId = getWorkspaceTargetAssetId(payload);
    const targetAsset = getWorkspaceTargetAsset(project, payload);
    const targetPath = targetAsset === null ? null : getAssetOperationPath(targetAsset);
    if (targetAssetId !== null && targetAsset === null) {
      throw new Error("Selected project asset is not registered in this project.");
    }
    if (targetAsset === null) {
      return source;
    }
    if (targetPath === null) {
      throw new Error("Selected project asset is not available as a local operation target.");
    }
    const sourceKind = asNonEmptyString(source["kind"]) || "video";
    const targetKind = inferAssetSourceKind(targetAsset, sourceKind);
    const sourceMetadata = toRecord(source["metadata"]);
    const assetMetadata = toRecord(targetAsset.metadata);
    const derivedFromSourceId = getImportSourceIdForAsset(project, targetAsset);
    return {
      ...source,
      kind: targetKind,
      mode: "asset",
      status: "ready",
      storedPath: targetPath,
      storedFileName: asNonEmptyString(targetAsset.name) || targetPath.split(/[\\/]/).pop(),
      sourceUrl: asNonEmptyString(targetAsset.url) || targetPath,
      metadata: {
        ...sourceMetadata,
        ...assetMetadata,
        derivedFromAssetId: targetAsset.id,
        ...(derivedFromSourceId === null ? {} : { derivedFromSourceId }),
        originAssetId: targetAsset.id,
        originAssetType: targetAsset.type,
      },
    };
  }

  function getCurrentMediaRunId(project: LaboratoryRecord): string | null {
    return asNonEmptyString(
      toRecord(toRecord(toRecord(project["process"])["records"])["media-analysis"])["runId"]
    );
  }

  function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function readOperationSettings(
    capabilityId: LabOperationCapabilityId,
    payload: LaboratoryRecord
  ): LabSettingsRecord {
    return normalizeLabOperationSettings(capabilityId, payload["operationSettings"]);
  }

  class OperationCancelledError extends Error {
    constructor() {
      super(OPERATION_CANCELLED_MESSAGE);
      this.name = "OperationCancelledError";
    }
  }

  function isOperationCancelledError(error: unknown): error is OperationCancelledError {
    return error instanceof OperationCancelledError;
  }

  function assertToolRunSucceeded(runPayload: LaboratoryRecord, fallbackMessage: string) {
    const exitCode = typeof runPayload["exitCode"] === "number" ? runPayload["exitCode"] : 0;
    if (runPayload["cancelled"] === true) {
      throw new OperationCancelledError();
    }
    if (exitCode !== 0) {
      throw new Error(asNonEmptyString(runPayload["stderr"]) || fallbackMessage);
    }
  }

  function pushCancelledJobState(
    api: unknown,
    action: string,
    jobId: string,
    projectId: string,
    requestId: string
  ) {
    pushJobState(api, {
      action,
      jobId,
      message: OPERATION_CANCELLED_MESSAGE,
      projectId,
      requestId,
      stage: "cancelled",
      toolId: "ffmpeg",
    });
  }

  function clampRoundedSetting(
    settings: LabSettingsRecord,
    key: string,
    fallback: number,
    min: number,
    max: number
  ) {
    return Math.max(min, Math.min(max, Math.round(readNumberSetting(settings, key, fallback))));
  }

  function getImageExtension(format: string) {
    return format === "jpg" ? "jpg" : format === "webp" ? "webp" : "png";
  }

  function getAudioCodecForFormat(format: string) {
    switch (format) {
      case "flac":
        return "flac";
      case "mp3":
        return "libmp3lame";
      default:
        return "pcm_s16le";
    }
  }

  function getAudioChannelCount(channels: string, fallback: number) {
    if (channels === "mono") {
      return 1;
    }
    if (channels === "stereo") {
      return 2;
    }
    return fallback;
  }

  function getCrfForQuality(quality: string) {
    return quality === "high" ? "18" : quality === "compact" ? "30" : "23";
  }

  function getScaleFilter(scale: string) {
    switch (scale) {
      case "480p":
        return "scale=-2:480";
      case "720p":
        return "scale=-2:720";
      case "1080p":
        return "scale=-2:1080";
      default:
        return null;
    }
  }

  function getFpsFilter(fps: string) {
    return fps === "12" || fps === "24" || fps === "30" ? `fps=${fps}` : null;
  }

  function appendImageQualityArgs(args: string[], format: string, quality: number) {
    if (format === "jpg") {
      args.push("-q:v", String(Math.max(2, Math.round(31 - (quality / 100) * 29))));
    } else if (format === "webp") {
      args.push("-quality", String(Math.round(quality)));
    }
  }

  function readPreviewNumber(
    settings: LaboratoryRecord,
    key: keyof LabInteractiveSettings,
    fallback: number
  ) {
    const value = settings[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function readPreviewBoolean(
    settings: LaboratoryRecord,
    key: keyof LabInteractiveSettings,
    fallback: boolean
  ) {
    const value = settings[key];
    return typeof value === "boolean" ? value : fallback;
  }

  function buildPreviewSettingsFilters(settings: LaboratoryRecord): string[] {
    const brightness = readPreviewNumber(settings, "brightness", 100);
    const contrast = readPreviewNumber(settings, "contrast", 100);
    const gamma = readPreviewNumber(settings, "gamma", 1);
    const saturation = readPreviewNumber(settings, "saturation", 100);
    const hueRotate = readPreviewNumber(settings, "hueRotate", 0);
    const sharpness = readPreviewNumber(settings, "sharpness", 100);
    const filters: string[] = [];
    const eqParts: string[] = [];

    if (brightness !== 100) {
      eqParts.push(`brightness=${fixedFilterNumber((brightness - 100) / 200)}`);
    }
    if (contrast !== 100) {
      eqParts.push(`contrast=${fixedFilterNumber(contrast / 100)}`);
    }
    if (gamma !== 1) {
      eqParts.push(`gamma=${fixedFilterNumber(gamma)}`);
    }
    if (saturation !== 100) {
      eqParts.push(`saturation=${fixedFilterNumber(saturation / 100)}`);
    }
    if (eqParts.length > 0) {
      filters.push(`eq=${eqParts.join(":")}`);
    }
    if (hueRotate !== 0) {
      filters.push(`hue=h=${fixedFilterNumber((hueRotate * Math.PI) / 180)}`);
    }
    if (
      readPreviewBoolean(settings, "channelR", true) !== true ||
      readPreviewBoolean(settings, "channelG", true) !== true ||
      readPreviewBoolean(settings, "channelB", true) !== true
    ) {
      filters.push(
        `colorchannelmixer=rr=${readPreviewBoolean(settings, "channelR", true) ? "1" : "0"}:gg=${
          readPreviewBoolean(settings, "channelG", true) ? "1" : "0"
        }:bb=${readPreviewBoolean(settings, "channelB", true) ? "1" : "0"}`
      );
    }
    if (sharpness > 100) {
      filters.push(
        `unsharp=5:5:${fixedFilterNumber(0.3 + ((sharpness - 100) / 100) * 1.2)}:3:3:0.0`
      );
    } else if (sharpness < 100) {
      filters.push(`boxblur=${fixedFilterNumber(Math.max(0.2, (100 - sharpness) / 200))}:1`);
    }
    if (readPreviewBoolean(settings, "edgeHighlight", false)) {
      filters.push("edgedetect=mode=colormix:high=0.18:low=0.06");
    }
    if (readPreviewBoolean(settings, "invert", false)) {
      filters.push("negate");
    }
    return filters;
  }

  function fixedFilterNumber(value: number): string {
    return Number(value.toFixed(3)).toString();
  }

  function buildEnhancedFrameFilters(
    settings: LabSettingsRecord,
    previewSettings: LaboratoryRecord = {}
  ) {
    const preset = readStringSetting(settings, "preset", "clarity");
    const strength = readNumberSetting(settings, "strength", 1);
    const scaled = (base: number) => Number((base * strength).toFixed(3));
    const previewFilters = readBooleanSetting(settings, "applyPreviewSettings", false)
      ? buildPreviewSettingsFilters(previewSettings)
      : [];
    if (preset === "low-light") {
      return [
        `eq=brightness=${scaled(0.08)}:contrast=${scaled(1.2)}:gamma=1.45`,
        ...previewFilters,
      ];
    }
    if (preset === "edge") {
      return [`unsharp=7:7:${scaled(1.6)}:7:7:0.0`, ...previewFilters];
    }
    if (preset === "forensic") {
      return [
        `eq=contrast=${scaled(1.4)}:brightness=${scaled(0.03)}:saturation=${scaled(1.1)}`,
        `histeq=strength=${Math.min(1, scaled(0.28)).toFixed(2)}:intensity=0.25`,
        `unsharp=5:5:${scaled(1.1)}:3:3:0.2`,
        ...previewFilters,
      ];
    }
    return [
      `eq=contrast=${scaled(1.25)}:brightness=${scaled(0.04)}:saturation=${scaled(1.15)}`,
      `unsharp=5:5:${scaled(0.8)}:3:3:0.4`,
      ...previewFilters,
    ];
  }

  function formatTimestamp(ms: number) {
    const safeMs = Math.max(0, Math.round(ms));
    const totalSeconds = Math.floor(safeMs / 1000);
    const milliseconds = safeMs % 1000;
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  }

  function formatTimestampFileToken(ms: number) {
    return formatTimestamp(ms).replaceAll(":", "-").replace(".", "-");
  }

  function escapeDrawtextValue(value: string) {
    return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
  }

  function buildTimestampFilter(ms: number) {
    return `drawtext=text='${escapeDrawtextValue(formatTimestamp(ms))}':x=16:y=h-th-16:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.55`;
  }

  function getFrameGrabSeekPoints(params: {
    endMs: number | null;
    rawSeekMs: number;
    settings: LabSettingsRecord;
    source: LaboratoryRecord;
    startMs: number | null;
  }) {
    const frameMode = readStringSetting(params.settings, "frameMode", "current");
    if (
      frameMode === "middle" &&
      params.startMs !== null &&
      params.endMs !== null &&
      params.endMs > params.startMs
    ) {
      return [Math.round(params.startMs + (params.endMs - params.startMs) / 2)];
    }
    if (frameMode !== "burst") {
      return [Math.max(0, Math.round(params.rawSeekMs))];
    }

    const burstCount = clampRoundedSetting(params.settings, "burstCount", 1, 1, 12);
    if (burstCount <= 1) {
      return [Math.max(0, Math.round(params.rawSeekMs))];
    }
    if (params.startMs !== null && params.endMs !== null && params.endMs > params.startMs) {
      const rangeStartMs = params.startMs;
      const span = params.endMs - params.startMs;
      return Array.from({ length: burstCount }, function (_entry, index) {
        return Math.round(rangeStartMs + (span * index) / Math.max(1, burstCount - 1));
      });
    }

    const durationMs = getSourceDurationMs(params.source);
    const stepMs = 500;
    const firstMs = Math.max(0, Math.round(params.rawSeekMs - ((burstCount - 1) * stepMs) / 2));
    return Array.from({ length: burstCount }, function (_entry, index) {
      const seekMs = firstMs + index * stepMs;
      return durationMs === null ? seekMs : Math.min(durationMs, seekMs);
    });
  }

  function toEvenInteger(value: number, minimum: number) {
    const rounded = Math.max(minimum, Math.round(value));
    return rounded % 2 === 0 ? rounded : Math.max(minimum, rounded - 1);
  }

  function getSourceDimensions(source: LaboratoryRecord) {
    const metadata = toRecord(source["metadata"]);
    const width = asNumber(metadata["width"]);
    const height = asNumber(metadata["height"]);
    return width !== null && height !== null && width > 0 && height > 0 ? { width, height } : null;
  }

  function getSourceDurationMs(source: LaboratoryRecord): number | null {
    const durationSeconds = asNumber(toRecord(source["metadata"])["durationSeconds"]);
    return durationSeconds !== null && durationSeconds > 0
      ? Math.round(durationSeconds * 1000)
      : null;
  }

  function sourceAudioAvailability(
    sourceKind: string,
    source: LaboratoryRecord
  ): "ready" | "missing" {
    if (sourceKind === "audio") {
      return "ready";
    }
    const metadata = toRecord(source["metadata"]);
    const audioCodec = asNonEmptyString(metadata["audioCodec"]);
    if (audioCodec !== null) {
      return "ready";
    }
    const codec = asNonEmptyString(metadata["codec"]);
    if (codec !== null && codec.includes("+")) {
      return "ready";
    }
    return Object.keys(metadata).length > 0 && sourceKind === "video" ? "missing" : "ready";
  }

  function resolveNormalizedCropPixels(
    source: LaboratoryRecord,
    normalizedRoiValue: unknown
  ): {
    height: number;
    sourceDimensions: { height: number; width: number };
    width: number;
    x: number;
    y: number;
  } | null {
    const normalizedRoi = toRecord(normalizedRoiValue);
    const dimensions = getSourceDimensions(source);
    if (dimensions === null || Object.keys(normalizedRoi).length === 0) {
      return null;
    }

    const rawX = clampNumber(asNumber(normalizedRoi["x"]) ?? 0, 0, 1);
    const rawY = clampNumber(asNumber(normalizedRoi["y"]) ?? 0, 0, 1);
    const rawWidth = clampNumber(asNumber(normalizedRoi["width"]) ?? 1, 0.02, 1);
    const rawHeight = clampNumber(asNumber(normalizedRoi["height"]) ?? 1, 0.02, 1);
    const width = Math.min(dimensions.width, toEvenInteger(dimensions.width * rawWidth, 2));
    const height = Math.min(dimensions.height, toEvenInteger(dimensions.height * rawHeight, 2));
    const maxX = Math.max(0, dimensions.width - width);
    const maxY = Math.max(0, dimensions.height - height);

    return {
      height,
      sourceDimensions: dimensions,
      width,
      x: Math.min(maxX, Math.max(0, Math.floor(dimensions.width * rawX))),
      y: Math.min(maxY, Math.max(0, Math.floor(dimensions.height * rawY))),
    };
  }

  function hasNormalizedRoiPayload(payload: LaboratoryRecord) {
    return Object.keys(toRecord(payload["normalizedRoi"])).length > 0;
  }

  function getCurrentSourceAssetLink(project: LaboratoryRecord) {
    const sourceAssetId = deriveLabSourceId(project);
    return sourceAssetId === null
      ? {}
      : {
          derivedFromAssetId: sourceAssetId,
          derivedFromSourceId: sourceAssetId,
        };
  }

  function getOperationSourceAssetLink(project: LaboratoryRecord, payload: LaboratoryRecord) {
    const targetAssetId = getWorkspaceTargetAssetId(payload);
    const targetAsset = getWorkspaceTargetAsset(project, payload);
    const targetPath = targetAsset === null ? null : getAssetOperationPath(targetAsset);
    if (targetAssetId !== null && targetAsset === null) {
      throw new Error("Selected project asset is not registered in this project.");
    }
    if (targetAsset !== null && targetPath === null) {
      throw new Error("Selected project asset is not available as a local operation target.");
    }
    if (targetAsset === null) {
      return getCurrentSourceAssetLink(project);
    }
    const derivedFromSourceId = getImportSourceIdForAsset(project, targetAsset);
    return {
      ...(derivedFromSourceId === null ? {} : { sourceId: derivedFromSourceId }),
      derivedFromAssetId: targetAsset.id,
      ...(derivedFromSourceId === null ? {} : { derivedFromSourceId }),
    };
  }

  return {
    appendImageQualityArgs,
    assertToolRunSucceeded,
    buildEnhancedFrameFilters,
    buildTimestampFilter,
    clampNumber,
    formatTimestampFileToken,
    getAudioChannelCount,
    getAudioCodecForFormat,
    getCrfForQuality,
    getCurrentMediaRunId,
    getCurrentSourceAssetLink,
    getOperationSourceAssetLink,
    getOperationSourceRecord,
    getFpsFilter,
    getFrameGrabSeekPoints,
    getImageExtension,
    getProjectId,
    getScaleFilter,
    getSourceDimensions,
    getSourceDurationMs,
    getSourceRecord,
    hasNormalizedRoiPayload,
    isOperationCancelledError,
    pushCancelledJobState,
    readOperationSettings,
    resolveNormalizedCropPixels,
    sourceAudioAvailability,
  };
}
