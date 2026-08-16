import {
  createLabOutputAsset,
  findLabAssetById,
  upsertLabAsset,
} from "../../../shared/host/lab-assets.js";
import { inferLabAssetSourceKind } from "../../../shared/lab-asset-kind.js";
import {
  listLaboratoryDirectory,
  writeLaboratoryTextFile,
} from "../../../shared/host/electron-bridge.js";
import {
  readBooleanSetting,
  readNumberSetting,
  readStringSetting,
} from "../../../shared/host/settings-readers.js";
import type { LabAsset } from "../../../domain/lab-types.js";
import {
  MEDIA_EXPORT_ACTION_IDS,
  createMediaExportUtilities,
} from "./action-handlers-export-utils.js";
import type { LaboratoryRecord } from "./action-handlers-export-utils.js";
import { createMediaAudioExportActions } from "./action-handlers-export-audio.js";

type LaboratoryComparisonSide = "primary" | "reference";

type LaboratoryNormalizedRoiPayload = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type LaboratoryComparisonRoisPayload = {
  activeSide: LaboratoryComparisonSide;
  primary: LaboratoryNormalizedRoiPayload | null;
  reference: LaboratoryNormalizedRoiPayload | null;
};

type LaboratoryExportActionRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  callRoomTools: (payload: LaboratoryRecord) => Promise<unknown>;
  getActiveProject: (runtime: LaboratoryRecord) => LaboratoryRecord | null;
  getProjectEditOutputDir: (runtime: LaboratoryRecord, project: LaboratoryRecord) => string;
  patchActiveProject: (
    runtime: LaboratoryRecord,
    patcher: (project: LaboratoryRecord) => LaboratoryRecord
  ) => Promise<unknown>;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  registerJob: (runtime: LaboratoryRecord, job: LaboratoryRecord) => void;
  clearJob: (runtime: LaboratoryRecord, jobId: string) => void;
  cancelJobsForProject: (
    runtime: LaboratoryRecord,
    projectId: string,
    requestId: string,
    options?: {
      actionIds?: string[];
    }
  ) => Promise<unknown>;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaExportActionRuntime(deps: LaboratoryExportActionRuntimeDeps) {
  const {
    asNonEmptyString,
    asNumber,
    callRoomTools,
    getActiveProject,
    getProjectEditOutputDir,
    patchActiveProject,
    pushJobState,
    registerJob,
    clearJob,
    cancelJobsForProject,
    toRecord,
  } = deps;
  const {
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
    getFpsFilter,
    getFrameGrabSeekPoints,
    getImageExtension,
    getOperationSourceAssetLink,
    getOperationSourceRecord,
    getProjectId,
    getScaleFilter,
    getSourceDimensions,
    getSourceDurationMs,
    hasNormalizedRoiPayload,
    isOperationCancelledError,
    pushCancelledJobState,
    readOperationSettings,
    resolveNormalizedCropPixels,
    sourceAudioAvailability,
  } = createMediaExportUtilities({
    asNonEmptyString,
    asNumber,
    pushJobState,
    toRecord,
  });

  async function registerOutputAsset(
    runtime: LaboratoryRecord,
    inputProject: LaboratoryRecord,
    assetInput: Parameters<typeof createLabOutputAsset>[1]
  ): Promise<LabAsset> {
    let createdAsset: LabAsset | undefined;
    await patchActiveProject(runtime, function (nextProject) {
      createdAsset = createLabOutputAsset(nextProject, {
        ...assetInput,
        runId: assetInput.runId || getCurrentMediaRunId(inputProject),
      });
      return {
        ...nextProject,
        assets: upsertLabAsset(nextProject["assets"], createdAsset),
      };
    });
    if (createdAsset === undefined) {
      throw new Error("Output asset could not be registered.");
    }
    return createdAsset;
  }

  function getRoomId(runtime: LaboratoryRecord): string {
    return asNonEmptyString(runtime["roomId"]) || "laboratory";
  }

  async function ensureOutputDirectory(
    runtime: LaboratoryRecord,
    requestId: string,
    dirPath: string
  ): Promise<void> {
    await callRoomTools({
      operation: "ensure-dir",
      requestId,
      roomId: getRoomId(runtime),
      targetPath: dirPath,
    });
  }

  async function runTool(
    runtime: LaboratoryRecord,
    requestId: string,
    jobId: string,
    toolId: string,
    cwd: string,
    args: string[],
    timeoutMs: number,
    failureMessage: string
  ): Promise<LaboratoryRecord> {
    const runResult = toRecord(
      await callRoomTools({
        args,
        cwd,
        jobId,
        operation: "tool-run",
        requestId,
        roomId: getRoomId(runtime),
        timeoutMs,
        toolId,
      })
    );
    const runPayload = toRecord(runResult["run"]);
    assertToolRunSucceeded(runPayload, failureMessage);
    return runPayload;
  }

  function readComparisonReference(project: LaboratoryRecord, payload: LaboratoryRecord) {
    const assetId = asNonEmptyString(payload["comparisonReferenceAssetId"]);
    if (assetId === null) {
      throw new Error("Image comparison requires a selected reference image.");
    }
    const asset = findLabAssetById(project, assetId);
    if (asset === null) {
      throw new Error("Selected comparison reference is not registered in this project.");
    }
    if (inferLabAssetSourceKind(asset) !== "image") {
      throw new Error("Selected comparison reference must be an image asset.");
    }
    const localPath = asNonEmptyString(asset.localPath);
    if (localPath === null) {
      throw new Error("Selected comparison reference is not available as a local file.");
    }
    return { asset, localPath };
  }

  function fixedFilterNumber(value: number): string {
    return Number(value.toFixed(4)).toString();
  }

  function readNormalizedRoiPayload(value: unknown): LaboratoryNormalizedRoiPayload | null {
    const normalizedRoi = toRecord(value);
    const x = asNumber(normalizedRoi["x"]);
    const y = asNumber(normalizedRoi["y"]);
    const width = asNumber(normalizedRoi["width"]);
    const height = asNumber(normalizedRoi["height"]);
    if (x === null || y === null || width === null || height === null) {
      return null;
    }
    return { height, width, x, y };
  }

  function normalizeComparisonSide(value: unknown): LaboratoryComparisonSide {
    return asNonEmptyString(value) === "reference" ? "reference" : "primary";
  }

  function readComparisonRoisPayload(payload: LaboratoryRecord): LaboratoryComparisonRoisPayload {
    const comparisonRois = toRecord(payload["comparisonRois"]);
    const activeSide = normalizeComparisonSide(
      comparisonRois["activeSide"] || payload["comparisonRoiActiveSide"]
    );
    return {
      activeSide,
      primary:
        readNormalizedRoiPayload(comparisonRois["primary"]) ||
        readNormalizedRoiPayload(payload["primaryNormalizedRoi"]),
      reference:
        readNormalizedRoiPayload(comparisonRois["reference"]) ||
        readNormalizedRoiPayload(payload["referenceNormalizedRoi"]),
    };
  }

  function buildComparisonRoisContext(payload: LaboratoryRecord) {
    const comparisonRois = readComparisonRoisPayload(payload);
    if (comparisonRois.primary === null && comparisonRois.reference === null) {
      return null;
    }
    return comparisonRois;
  }

  function formatRoiPercent(value: number) {
    return `${String(Math.round(value * 100))}%`;
  }

  function formatComparisonRoiSide(
    label: string,
    roi: LaboratoryNormalizedRoiPayload | null
  ): string | null {
    if (roi === null) {
      return null;
    }
    return `${label} ROI x=${formatRoiPercent(roi.x)}, y=${formatRoiPercent(roi.y)}, w=${formatRoiPercent(roi.width)}, h=${formatRoiPercent(roi.height)}`;
  }

  function buildComparisonRoiSummary(comparisonRois: LaboratoryComparisonRoisPayload | null) {
    if (comparisonRois === null) {
      return null;
    }
    const entries = [
      formatComparisonRoiSide("Primary", comparisonRois.primary),
      formatComparisonRoiSide("Reference", comparisonRois.reference),
    ].filter((entry): entry is string => entry !== null);
    if (entries.length === 0) {
      return null;
    }
    return `${entries.join("; ")}; active=${comparisonRois.activeSide}`;
  }

  function buildNormalizedCropFilterFromRoi(
    normalizedRoi: LaboratoryNormalizedRoiPayload | null
  ): string | null {
    if (normalizedRoi === null) {
      return null;
    }
    return `crop=iw*${fixedFilterNumber(normalizedRoi.width)}:ih*${fixedFilterNumber(normalizedRoi.height)}:iw*${fixedFilterNumber(normalizedRoi.x)}:ih*${fixedFilterNumber(normalizedRoi.y)}`;
  }

  function buildSquarePadFilter(inputLabel: string, outputLabel: string, size: number): string {
    return `${inputLabel}scale=${String(size)}:${String(size)}:force_original_aspect_ratio=decrease,pad=${String(size)}:${String(size)}:(ow-iw)/2:(oh-ih)/2,setsar=1${outputLabel}`;
  }

  function buildNormalizedCropFilter(payload: LaboratoryRecord): string | null {
    return buildNormalizedCropFilterFromRoi(readNormalizedRoiPayload(payload["normalizedRoi"]));
  }

  function buildComparisonDetailRoiFilters(payload: LaboratoryRecord) {
    const comparisonRois = readComparisonRoisPayload(payload);
    const shared = buildNormalizedCropFilter(payload);
    return {
      primary: buildNormalizedCropFilterFromRoi(comparisonRois.primary) || shared,
      reference: buildNormalizedCropFilterFromRoi(comparisonRois.reference) || shared,
      shared,
    };
  }

  function readDetailRoiFilter(value: string | null | undefined) {
    return typeof value === "string" && value.trim() !== "" ? value : null;
  }

  function buildImagePairFilterComplex(options: {
    detailRoiFilter?: string | null;
    layout: string;
    mode: "side-by-side" | "difference" | "split" | "roi-detail";
    primaryDetailRoiFilter?: string | null;
    referenceDetailRoiFilter?: string | null;
    size: number;
    splitPercent?: number | null;
    splitMode?: string;
  }) {
    const size = Math.max(256, Math.round(options.size));
    const splitPercent =
      typeof options.splitPercent === "number" && Number.isFinite(options.splitPercent)
        ? Math.max(5, Math.min(95, options.splitPercent))
        : 50;
    const leftSize = Math.max(2, Math.min(size - 2, Math.round(size * (splitPercent / 100))));
    const rightSize = Math.max(2, size - leftSize);
    if (options.mode === "difference") {
      return [
        buildSquarePadFilter("[0:v]", "[p0]", size),
        buildSquarePadFilter("[1:v]", "[p1]", size),
        "[p0][p1]blend=all_mode=difference,eq=contrast=2:brightness=0.02[out]",
      ].join(";");
    }
    if (options.mode === "split") {
      if (options.splitMode === "primary-mirror") {
        return [
          buildSquarePadFilter("[0:v]", "[p0]", size),
          "[p0]split[leftsrc][rightsrc]",
          `[leftsrc]crop=${String(leftSize)}:${String(size)}:0:0[left]`,
          `[rightsrc]crop=${String(rightSize)}:${String(size)}:${String(leftSize)}:0,hflip[right]`,
          "[left][right]hstack=inputs=2[out]",
        ].join(";");
      }
      return [
        buildSquarePadFilter("[0:v]", "[p0]", size),
        buildSquarePadFilter("[1:v]", "[p1]", size),
        `[p0]crop=${String(leftSize)}:${String(size)}:0:0[left]`,
        `[p1]crop=${String(rightSize)}:${String(size)}:${String(leftSize)}:0[right]`,
        "[left][right]hstack=inputs=2[out]",
      ].join(";");
    }
    const sharedRoiFilter = readDetailRoiFilter(options.detailRoiFilter);
    const explicitPrimaryRoiFilter = readDetailRoiFilter(options.primaryDetailRoiFilter);
    const explicitReferenceRoiFilter = readDetailRoiFilter(options.referenceDetailRoiFilter);
    const primaryRoiFilter =
      explicitPrimaryRoiFilter || sharedRoiFilter || explicitReferenceRoiFilter;
    const referenceRoiFilter = explicitReferenceRoiFilter || sharedRoiFilter || primaryRoiFilter;
    if (options.mode === "roi-detail" && primaryRoiFilter !== null && referenceRoiFilter !== null) {
      return [
        `[0:v]${primaryRoiFilter}[r0src]`,
        `[1:v]${referenceRoiFilter}[r1src]`,
        buildSquarePadFilter("[r0src]", "[p0]", size),
        buildSquarePadFilter("[r1src]", "[p1]", size),
        options.layout === "stacked"
          ? "[p0][p1]vstack=inputs=2[out]"
          : "[p0][p1]hstack=inputs=2[out]",
      ].join(";");
    }
    return [
      buildSquarePadFilter("[0:v]", "[p0]", size),
      buildSquarePadFilter("[1:v]", "[p1]", size),
      options.layout === "stacked"
        ? "[p0][p1]vstack=inputs=2[out]"
        : "[p0][p1]hstack=inputs=2[out]",
    ].join(";");
  }

  function parseSsimMetric(stderr: unknown): number | null {
    const match = String(stderr || "").match(/All:([0-9.]+)/);
    if (!match) {
      return null;
    }
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  function parsePsnrMetric(stderr: unknown): number | "inf" | null {
    const match = String(stderr || "").match(/average:([0-9.]+|inf)/i);
    if (!match) {
      return null;
    }
    if (match[1]?.toLowerCase() === "inf") {
      return "inf";
    }
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  async function exportROIImage(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for ROI export.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const storedPath = asNonEmptyString(source["storedPath"]);
    if (storedPath === null) {
      throw new Error("No source file available for ROI export.");
    }

    const regionId = asNonEmptyString(payload["regionId"]) || "unknown";
    const normalizedCrop = resolveNormalizedCropPixels(source, payload["normalizedRoi"]);
    if (hasNormalizedRoiPayload(payload) && normalizedCrop === null) {
      throw new Error("Source dimensions are required for normalized ROI export.");
    }
    const cropX = normalizedCrop?.x ?? asNumber(payload["x"]) ?? 0;
    const cropY = normalizedCrop?.y ?? asNumber(payload["y"]) ?? 0;
    const cropW = normalizedCrop?.width ?? asNumber(payload["width"]) ?? 100;
    const cropH = normalizedCrop?.height ?? asNumber(payload["height"]) ?? 100;
    const sourceKind = asNonEmptyString(source["kind"]) || "video";
    const seekMs = asNumber(payload["seekMs"]);
    const settings = readOperationSettings("roi-crop", payload);

    if (payload["allowParallelWorkspaceOperation"] !== true) {
      await cancelJobsForProject(runtime, projectId, requestId, {
        actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
      });
    }

    const jobId = `export-roi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-roi-image",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: "export-roi-image",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      const format = getImageExtension(readStringSetting(settings, "format", "png"));
      const outputFileName = `roi-${regionId}-${Date.now()}.${format}`;
      const outputPath = `${outputDir}/${outputFileName}`;
      const padding = readNumberSetting(settings, "padding", 0);
      const aspectLock = readStringSetting(settings, "aspectLock", "free");
      let nextCropX = cropX - padding;
      let nextCropY = cropY - padding;
      let nextCropW = cropW + padding * 2;
      let nextCropH = cropH + padding * 2;
      const dimensions = getSourceDimensions(source);
      if (aspectLock !== "free") {
        const ratio = aspectLock === "square" ? 1 : aspectLock === "16:9" ? 16 / 9 : 4 / 3;
        const currentRatio = nextCropW / Math.max(1, nextCropH);
        if (currentRatio > ratio) {
          const targetH = nextCropW / ratio;
          nextCropY -= (targetH - nextCropH) / 2;
          nextCropH = targetH;
        } else {
          const targetW = nextCropH * ratio;
          nextCropX -= (targetW - nextCropW) / 2;
          nextCropW = targetW;
        }
      }
      if (dimensions !== null) {
        nextCropX = clampNumber(nextCropX, 0, dimensions.width - 1);
        nextCropY = clampNumber(nextCropY, 0, dimensions.height - 1);
        nextCropW = clampNumber(nextCropW, 1, dimensions.width - nextCropX);
        nextCropH = clampNumber(nextCropH, 1, dimensions.height - nextCropY);
      }
      const outputSize = readStringSetting(settings, "outputSize", "source");
      const filters = [
        `crop=${String(Math.round(nextCropW))}:${String(Math.round(nextCropH))}:${String(Math.round(nextCropX))}:${String(Math.round(nextCropY))}`,
        outputSize === "512" || outputSize === "1024" || outputSize === "2048"
          ? `scale=${outputSize}:-2`
          : null,
      ].filter((entry): entry is string => entry !== null);

      const args: string[] = ["-y"];

      if (sourceKind === "video") {
        if (seekMs !== null && seekMs > 0) {
          args.push("-ss", String(seekMs / 1000));
        }
        args.push("-i", storedPath, "-frames:v", "1");
      } else {
        args.push("-i", storedPath);
      }

      args.push("-filter:v", filters.join(","));
      appendImageQualityArgs(args, format, 92);
      args.push(outputPath);

      const runResult = toRecord(
        await callRoomTools({
          args,
          cwd: outputDir,
          jobId,
          operation: "tool-run",
          requestId,
          roomId: asNonEmptyString(runtime["roomId"]) || "laboratory",
          timeoutMs: 30 * 1000,
          toolId: "ffmpeg",
        })
      );

      const runPayload = toRecord(runResult["run"]);
      assertToolRunSucceeded(runPayload, "ffmpeg ROI export failed.");

      const createdAsset = await registerOutputAsset(runtime, project, {
        type: "image",
        name: outputFileName,
        localPath: outputPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "export-roi-image",
          evidenceRole: "derived",
          fileName: outputFileName,
          filterPreset: "roi-crop",
          flowKind: "operation-result",
          operationId: "roi-crop",
          regionId,
          requestId,
          settingsUsed: settings,
          ...(asNonEmptyString(payload["workspaceResultMode"]) === null
            ? {}
            : { workspaceResultMode: asNonEmptyString(payload["workspaceResultMode"]) }),
          ...(asNonEmptyString(payload["workspaceResultTargetSide"]) === null
            ? {}
            : {
                workspaceResultTargetSide: asNonEmptyString(payload["workspaceResultTargetSide"]),
              }),
          ...(asNonEmptyString(payload["workspaceOperationBatchId"]) === null
            ? {}
            : {
                workspaceOperationBatchId: asNonEmptyString(payload["workspaceOperationBatchId"]),
              }),
          ...(asNumber(payload["workspaceOperationBatchSize"]) === null
            ? {}
            : { workspaceOperationBatchSize: asNumber(payload["workspaceOperationBatchSize"]) }),
          ...(seekMs === null
            ? {}
            : {
                sourceRange: {
                  endMs: seekMs,
                  startMs: seekMs,
                },
              }),
          ...(normalizedCrop === null
            ? {}
            : {
                cropPixels: {
                  height: normalizedCrop.height,
                  width: normalizedCrop.width,
                  x: normalizedCrop.x,
                  y: normalizedCrop.y,
                },
                normalizedRoi: toRecord(payload["normalizedRoi"]),
                sourceDimensions: normalizedCrop.sourceDimensions,
              }),
          toolId: "ffmpeg",
        },
      });
      pushJobState(api, {
        action: "export-roi-image",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [createdAsset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        outputPath,
        outputFileName,
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-roi-image", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-roi-image",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function exportFrameGrab(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for frame export.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const storedPath = asNonEmptyString(source["storedPath"]);
    if (storedPath === null) {
      throw new Error("No source file available for frame export.");
    }

    const sourceKind = asNonEmptyString(source["kind"]) || "video";
    if (sourceKind !== "video") {
      throw new Error("Frame export is only available for video sources.");
    }

    const rawSeekMs = asNumber(payload["seekMs"]) || 0;
    const startMs = asNumber(payload["startMs"]);
    const endMs = asNumber(payload["endMs"]);
    const settings = readOperationSettings("frame-grab", payload);
    const seekPoints = getFrameGrabSeekPoints({
      endMs,
      rawSeekMs,
      settings,
      source,
      startMs,
    });
    const timestampLabel = readBooleanSetting(settings, "timestampLabel", false);

    await cancelJobsForProject(runtime, projectId, requestId, {
      actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
    });

    const jobId = `export-frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-frame-grab",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: "export-frame-grab",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      const format = getImageExtension(readStringSetting(settings, "format", "png"));
      const quality = readNumberSetting(settings, "quality", 92);
      const frameResults = await seekPoints.reduce<
        Promise<Array<{ asset: LabAsset; outputFileName: string; outputPath: string }>>
      >(async function (previousResults, seekMs, index) {
        const results = await previousResults;
        const outputFileName =
          seekPoints.length > 1
            ? `frame-${formatTimestampFileToken(seekMs)}-${String(index + 1).padStart(2, "0")}-${Date.now()}.${format}`
            : `frame-${String(Math.round(seekMs))}ms-${Date.now()}.${format}`;
        const outputPath = `${outputDir}/${outputFileName}`;
        const args: string[] = [
          "-y",
          "-ss",
          String(seekMs / 1000),
          "-i",
          storedPath,
          "-frames:v",
          "1",
        ];
        if (timestampLabel) {
          args.push("-filter:v", buildTimestampFilter(seekMs));
        }
        appendImageQualityArgs(args, format, quality);
        args.push(outputPath);

        const runResult = toRecord(
          await callRoomTools({
            args,
            cwd: outputDir,
            jobId,
            operation: "tool-run",
            requestId,
            roomId: asNonEmptyString(runtime["roomId"]) || "laboratory",
            timeoutMs: 30 * 1000,
            toolId: "ffmpeg",
          })
        );

        const runPayload = toRecord(runResult["run"]);
        assertToolRunSucceeded(runPayload, "ffmpeg frame grab failed.");

        const asset = await registerOutputAsset(runtime, project, {
          type: "frame",
          name: outputFileName,
          localPath: outputPath,
          ...getOperationSourceAssetLink(project, payload),
          metadata: {
            action: "export-frame-grab",
            evidenceRole: "derived",
            fileName: outputFileName,
            filterPreset: "frame-grab",
            flowKind: "operation-result",
            operationId: "frame-grab",
            requestId,
            seekMs,
            settingsUsed: settings,
            sourceRange: {
              endMs: seekMs,
              startMs: seekMs,
            },
            timestampLabel,
            toolId: "ffmpeg",
          },
        });
        return [...results, { asset, outputFileName, outputPath }];
      }, Promise.resolve([]));
      const createdAssets = frameResults.map(function (result) {
        return result.asset;
      });
      const outputPaths = frameResults.map(function (result) {
        return result.outputPath;
      });
      const outputFileNames = frameResults.map(function (result) {
        return result.outputFileName;
      });
      pushJobState(api, {
        action: "export-frame-grab",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: createdAssets.map(function (asset) {
          return asset.id;
        }),
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        outputFileName: outputFileNames[0] || null,
        outputFileNames,
        outputPath: outputPaths[0] || null,
        outputPaths,
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-frame-grab", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-frame-grab",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function exportEnhancedFrame(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for enhanced frame export.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const storedPath = asNonEmptyString(source["storedPath"]);
    if (storedPath === null) {
      throw new Error("No source file available for enhanced frame export.");
    }

    const sourceKind = asNonEmptyString(source["kind"]) || "video";
    if (sourceKind !== "video" && sourceKind !== "image") {
      throw new Error("Enhanced frame export is only available for video or image sources.");
    }

    const seekMs = asNumber(payload["seekMs"]) || 0;
    const settings = readOperationSettings("enhanced-frame", payload);
    const previewSettings = toRecord(payload["previewSettings"]);
    const normalizedCrop = resolveNormalizedCropPixels(source, payload["normalizedRoi"]);
    if (hasNormalizedRoiPayload(payload) && normalizedCrop === null) {
      throw new Error("Source dimensions are required for normalized enhanced frame export.");
    }

    if (payload["allowParallelWorkspaceOperation"] !== true) {
      await cancelJobsForProject(runtime, projectId, requestId, {
        actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
      });
    }

    const jobId = `export-enhanced-frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-enhanced-frame",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: "export-enhanced-frame",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      const format = getImageExtension(readStringSetting(settings, "format", "png"));
      const outputSide = asNonEmptyString(payload["workspaceResultTargetSide"]);
      const outputFileName = `enhanced-frame${
        outputSide === null ? "" : `-${outputSide}`
      }-${String(Math.round(seekMs))}ms-${Date.now()}.${format}`;
      const outputPath = `${outputDir}/${outputFileName}`;
      const filters = [
        ...(normalizedCrop === null
          ? []
          : [
              `crop=${String(normalizedCrop.width)}:${String(normalizedCrop.height)}:${String(
                normalizedCrop.x
              )}:${String(normalizedCrop.y)}`,
            ]),
        ...buildEnhancedFrameFilters(settings, previewSettings),
      ];
      const args: string[] = ["-y"];

      if (sourceKind === "video") {
        if (seekMs > 0) {
          args.push("-ss", String(seekMs / 1000));
        }
        args.push("-i", storedPath, "-frames:v", "1");
      } else {
        args.push("-i", storedPath, "-frames:v", "1");
      }
      appendImageQualityArgs(args, format, 92);
      args.push("-filter:v", filters.join(","), outputPath);

      const runResult = toRecord(
        await callRoomTools({
          args,
          cwd: outputDir,
          jobId,
          operation: "tool-run",
          requestId,
          roomId: asNonEmptyString(runtime["roomId"]) || "laboratory",
          timeoutMs: 30 * 1000,
          toolId: "ffmpeg",
        })
      );

      const runPayload = toRecord(runResult["run"]);
      assertToolRunSucceeded(runPayload, "ffmpeg enhanced frame export failed.");

      const createdAsset = await registerOutputAsset(runtime, project, {
        type: sourceKind === "video" ? "frame" : "image",
        name: outputFileName,
        localPath: outputPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "export-enhanced-frame",
          evidenceRole: "derived",
          fileName: outputFileName,
          filterPreset: readStringSetting(settings, "preset", "clarity"),
          flowKind: "operation-result",
          operationId: "enhanced-frame",
          requestId,
          seekMs,
          settingsUsed: settings,
          ...(asNonEmptyString(payload["workspaceResultMode"]) === null
            ? {}
            : { workspaceResultMode: asNonEmptyString(payload["workspaceResultMode"]) }),
          ...(asNonEmptyString(payload["workspaceResultTargetSide"]) === null
            ? {}
            : {
                workspaceResultTargetSide: asNonEmptyString(payload["workspaceResultTargetSide"]),
              }),
          ...(asNonEmptyString(payload["workspaceOperationBatchId"]) === null
            ? {}
            : {
                workspaceOperationBatchId: asNonEmptyString(payload["workspaceOperationBatchId"]),
              }),
          ...(asNumber(payload["workspaceOperationBatchSize"]) === null
            ? {}
            : { workspaceOperationBatchSize: asNumber(payload["workspaceOperationBatchSize"]) }),
          sourceRange: {
            endMs: seekMs,
            startMs: seekMs,
          },
          ...(normalizedCrop === null
            ? {}
            : {
                cropPixels: {
                  height: normalizedCrop.height,
                  width: normalizedCrop.width,
                  x: normalizedCrop.x,
                  y: normalizedCrop.y,
                },
                normalizedRoi: toRecord(payload["normalizedRoi"]),
                sourceDimensions: normalizedCrop.sourceDimensions,
              }),
          toolId: "ffmpeg",
        },
      });
      pushJobState(api, {
        action: "export-enhanced-frame",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [createdAsset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        outputPath,
        outputFileName,
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-enhanced-frame", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-enhanced-frame",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function exportBeforeAfterVariant(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for before/after export.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const storedPath = asNonEmptyString(source["storedPath"]);
    if (storedPath === null) {
      throw new Error("No source file available for before/after export.");
    }

    const sourceKind = asNonEmptyString(source["kind"]) || "video";
    if (sourceKind !== "video" && sourceKind !== "image") {
      throw new Error("Before/after export is only available for video or image sources.");
    }

    const seekMs = asNumber(payload["seekMs"]) || 0;
    const settings = readOperationSettings("before-after-variant", payload);
    const normalizedCrop = resolveNormalizedCropPixels(source, payload["normalizedRoi"]);
    if (hasNormalizedRoiPayload(payload) && normalizedCrop === null) {
      throw new Error("Source dimensions are required for normalized before/after export.");
    }

    await cancelJobsForProject(runtime, projectId, requestId, {
      actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
    });

    const jobId = `export-before-after-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-before-after-variant",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: "export-before-after-variant",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      const format = getImageExtension(readStringSetting(settings, "format", "png"));
      const layout = readStringSetting(settings, "layout", "side-by-side");
      const revealPreset = readStringSetting(settings, "revealPreset", "clarity");
      const enhancedFilters = buildEnhancedFrameFilters({
        ...settings,
        preset: revealPreset,
      }).join(",");
      const outputFileName = `before-after-${String(Math.round(seekMs))}ms-${Date.now()}.${format}`;
      const outputPath = `${outputDir}/${outputFileName}`;
      const cropFilter =
        normalizedCrop === null
          ? null
          : `crop=${String(normalizedCrop.width)}:${String(normalizedCrop.height)}:${String(
              normalizedCrop.x
            )}:${String(normalizedCrop.y)}`;
      const sourcePrefix = cropFilter === null ? "[0:v]" : `[0:v]${cropFilter}[base];[base]`;
      const filterComplex =
        layout === "wipe"
          ? [
              `${sourcePrefix}split=2[orig][enhsrc]`,
              `[enhsrc]${enhancedFilters}[enh]`,
              "[orig]crop=iw/2:ih:0:0[left]",
              "[enh]crop=iw/2:ih:iw/2:0[right]",
              "[left][right]hstack=inputs=2[out]",
            ].join(";")
          : [
              `${sourcePrefix}split=2[orig][enhsrc]`,
              `[enhsrc]${enhancedFilters}[enh]`,
              layout === "stacked"
                ? "[orig][enh]vstack=inputs=2[out]"
                : "[orig][enh]hstack=inputs=2[out]",
            ].join(";");
      const args: string[] = ["-y"];
      if (sourceKind === "video" && seekMs > 0) {
        args.push("-ss", String(seekMs / 1000));
      }
      args.push(
        "-i",
        storedPath,
        "-filter_complex",
        filterComplex,
        "-map",
        "[out]",
        "-frames:v",
        "1"
      );
      appendImageQualityArgs(args, format, 92);
      args.push(outputPath);

      await runTool(
        runtime,
        requestId,
        jobId,
        "ffmpeg",
        outputDir,
        args,
        60 * 1000,
        "ffmpeg before/after export failed."
      );

      const createdAsset = await registerOutputAsset(runtime, project, {
        type: "image",
        name: outputFileName,
        localPath: outputPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "export-before-after-variant",
          evidenceRole: "derived",
          fileName: outputFileName,
          filterPreset: revealPreset,
          flowKind: "operation-result",
          layout,
          operationId: "before-after-variant",
          requestId,
          seekMs,
          settingsUsed: settings,
          toolId: "ffmpeg",
        },
      });
      pushJobState(api, {
        action: "export-before-after-variant",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [createdAsset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        outputPath,
        outputFileName,
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-before-after-variant", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-before-after-variant",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function exportImageComparison(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for image comparison.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const primaryPath = asNonEmptyString(source["storedPath"]);
    if (primaryPath === null) {
      throw new Error("No source file available for image comparison.");
    }
    if ((asNonEmptyString(source["kind"]) || "video") !== "image") {
      throw new Error("Image comparison is only available for image sources.");
    }
    const activeProject = project;
    const primaryImagePath = primaryPath;
    const reference = readComparisonReference(project, payload);
    const settings = readOperationSettings("image-comparison", payload);

    await cancelJobsForProject(runtime, projectId, requestId, {
      actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
    });

    const jobId = `export-image-comparison-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-image-comparison",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: "export-image-comparison",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      await ensureOutputDirectory(runtime, requestId, outputDir);
      const format = getImageExtension(readStringSetting(settings, "format", "png"));
      const layout = readStringSetting(settings, "layout", "side-by-side");
      const packageMode = readStringSetting(settings, "package", "detailed");
      const metricSize = Math.round(readNumberSetting(settings, "metricSize", 512));
      const splitMode = readStringSetting(settings, "splitMode", "primary-left-reference-right");
      const includeRoiDetail = readBooleanSetting(settings, "includeRoiDetail", true);
      const detailRoiFilters = includeRoiDetail
        ? buildComparisonDetailRoiFilters(payload)
        : { primary: null, reference: null, shared: null };
      const comparisonRois = buildComparisonRoisContext(payload);
      const timestamp = Date.now();
      const createdAssets: LabAsset[] = [];

      async function renderComparisonImage(kind: string, filterComplex: string) {
        const outputFileName = `image-comparison-${kind}-${timestamp}.${format}`;
        const outputPath = `${outputDir}/${outputFileName}`;
        const args: string[] = [
          "-y",
          "-i",
          primaryImagePath,
          "-i",
          reference.localPath,
          "-filter_complex",
          filterComplex,
          "-map",
          "[out]",
          "-frames:v",
          "1",
        ];
        appendImageQualityArgs(args, format, 92);
        args.push(outputPath);
        await runTool(
          runtime,
          requestId,
          jobId,
          "ffmpeg",
          outputDir,
          args,
          90 * 1000,
          `ffmpeg image comparison ${kind} export failed.`
        );
        const asset = await registerOutputAsset(runtime, activeProject, {
          type: "image",
          name: outputFileName,
          localPath: outputPath,
          ...getOperationSourceAssetLink(activeProject, payload),
          metadata: {
            action: "export-image-comparison",
            comparisonKind: kind,
            evidenceRole: "derived",
            fileName: outputFileName,
            flowKind: "operation-result",
            operationId: "image-comparison",
            referenceAssetId: reference.asset.id,
            requestId,
            settingsUsed: settings,
            ...(comparisonRois === null ? {} : { comparisonRois }),
            toolId: "ffmpeg",
          },
        });
        createdAssets.push(asset);
      }

      await renderComparisonImage(
        "side-by-side",
        buildImagePairFilterComplex({
          layout,
          mode: "side-by-side",
          size: 720,
        })
      );

      if (packageMode === "detailed") {
        await renderComparisonImage(
          "difference",
          buildImagePairFilterComplex({
            layout,
            mode: "difference",
            size: 720,
          })
        );
        await renderComparisonImage(
          "split",
          buildImagePairFilterComplex({
            layout,
            mode: "split",
            size: 720,
            splitMode,
          })
        );
        if (detailRoiFilters.primary !== null || detailRoiFilters.reference !== null) {
          await renderComparisonImage(
            "roi-detail",
            buildImagePairFilterComplex({
              detailRoiFilter: detailRoiFilters.shared,
              layout,
              mode: "roi-detail",
              primaryDetailRoiFilter: detailRoiFilters.primary,
              referenceDetailRoiFilter: detailRoiFilters.reference,
              size: 720,
            })
          );
        }
      }

      const ssimRun = await runTool(
        runtime,
        requestId,
        jobId,
        "ffmpeg",
        outputDir,
        [
          "-y",
          "-i",
          primaryImagePath,
          "-i",
          reference.localPath,
          "-lavfi",
          [
            buildSquarePadFilter("[0:v]", "[m0]", metricSize),
            buildSquarePadFilter("[1:v]", "[m1]", metricSize),
            "[m0][m1]ssim",
          ].join(";"),
          "-f",
          "null",
          "-",
        ],
        90 * 1000,
        "ffmpeg SSIM comparison failed."
      );
      const psnrRun = await runTool(
        runtime,
        requestId,
        jobId,
        "ffmpeg",
        outputDir,
        [
          "-y",
          "-i",
          primaryImagePath,
          "-i",
          reference.localPath,
          "-lavfi",
          [
            buildSquarePadFilter("[0:v]", "[m0]", metricSize),
            buildSquarePadFilter("[1:v]", "[m1]", metricSize),
            "[m0][m1]psnr",
          ].join(";"),
          "-f",
          "null",
          "-",
        ],
        90 * 1000,
        "ffmpeg PSNR comparison failed."
      );
      const ssimAll = parseSsimMetric(ssimRun["stderr"]);
      const psnrAverage = parsePsnrMetric(psnrRun["stderr"]);
      const metricsPath = `${outputDir}/image-comparison-metrics-${timestamp}.json`;
      const metricsFileName = metricsPath.split(/[\\/]/).pop() || "image-comparison-metrics.json";
      const metricsPayload = {
        generatedAt: new Date().toISOString(),
        operationId: "image-comparison",
        primaryPath: primaryImagePath,
        referenceAssetId: reference.asset.id,
        referencePath: reference.localPath,
        settingsUsed: settings,
        ...(comparisonRois === null ? {} : { comparisonRois }),
        metrics: {
          ssimAll,
          psnrAverage,
          similarityPercent: ssimAll === null ? null : Number((ssimAll * 100).toFixed(2)),
        },
      };
      await writeLaboratoryTextFile(metricsPath, `${JSON.stringify(metricsPayload, null, 2)}\n`);
      const metricsAsset = await registerOutputAsset(runtime, activeProject, {
        type: "artifact",
        name: metricsFileName,
        localPath: metricsPath,
        ...getOperationSourceAssetLink(activeProject, payload),
        metadata: {
          action: "export-image-comparison",
          artifactKind: "image-comparison-metrics",
          evidenceRole: "derived",
          flowKind: "operation-result",
          operationId: "image-comparison",
          referenceAssetId: reference.asset.id,
          requestId,
          ...(comparisonRois === null ? {} : { comparisonRois }),
          toolId: "ffmpeg",
        },
      });
      createdAssets.push(metricsAsset);

      pushJobState(api, {
        action: "export-image-comparison",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: createdAssets.map(function (asset) {
          return asset.id;
        }),
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        outputFileNames: createdAssets.map(function (asset) {
          return asset.name;
        }),
        outputPaths: createdAssets.map(function (asset) {
          return asNonEmptyString(asset.localPath);
        }),
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-image-comparison", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-image-comparison",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  function resolveComparisonRenderMode(payload: LaboratoryRecord, layout: string) {
    const viewMode = asNonEmptyString(payload["comparisonViewMode"]) || layout;
    if (viewMode === "difference" || viewMode === "split" || viewMode === "roi-detail") {
      return viewMode;
    }
    return "side-by-side";
  }

  function resolveComparisonLayout(payload: LaboratoryRecord, settings: LaboratoryRecord) {
    const viewMode = asNonEmptyString(payload["comparisonViewMode"]);
    if (viewMode === "stacked") {
      return "stacked";
    }
    if (viewMode === "side-by-side") {
      return "side-by-side";
    }
    return readStringSetting(settings, "layout", "side-by-side");
  }

  function getComparisonPrimaryAssetId(source: LaboratoryRecord, payload: LaboratoryRecord) {
    return (
      asNonEmptyString(payload["workspaceTargetAssetId"]) ||
      asNonEmptyString(source["sourceAssetId"]) ||
      asNonEmptyString(source["assetId"])
    );
  }

  function buildComparisonCaptureContext(input: {
    payload: LaboratoryRecord;
    primaryAssetId: string | null;
    referenceAssetId: string;
    settings: LaboratoryRecord;
  }) {
    const comparisonRois = buildComparisonRoisContext(input.payload);
    return {
      captureMode: asNonEmptyString(input.payload["captureKind"]) || "moment",
      comparisonViewMode:
        asNonEmptyString(input.payload["comparisonViewMode"]) ||
        readStringSetting(input.settings, "layout", "side-by-side"),
      layout: resolveComparisonLayout(input.payload, input.settings),
      primaryAssetId: input.primaryAssetId,
      referenceAssetId: input.referenceAssetId,
      splitPercent:
        asNumber(input.payload["comparisonSplitPercent"]) ??
        readNumberSetting(input.settings, "splitPercent", 50),
      normalizedRoi: toRecord(input.payload["normalizedRoi"]),
      ...(comparisonRois === null
        ? {}
        : {
            comparisonRoiActiveSide: comparisonRois.activeSide,
            comparisonRois,
            primaryNormalizedRoi: comparisonRois.primary,
            referenceNormalizedRoi: comparisonRois.reference,
          }),
      settingsUsed: input.settings,
    };
  }

  async function renderComparisonCaptureAsset(
    runtime: LaboratoryRecord,
    project: LaboratoryRecord,
    requestId: string,
    jobId: string,
    payload: LaboratoryRecord,
    options: {
      action: string;
      artifactKind: string;
      filePrefix: string;
      findingId?: string | null;
      timestamp: number;
    }
  ) {
    const source = getOperationSourceRecord(project, payload);
    const primaryPath = asNonEmptyString(source["storedPath"]);
    if (primaryPath === null) {
      throw new Error("No source file available for comparison capture.");
    }
    if ((asNonEmptyString(source["kind"]) || "video") !== "image") {
      throw new Error("Comparison capture is only available for image sources.");
    }

    const reference = readComparisonReference(project, payload);
    const settings = readOperationSettings("image-comparison", payload);
    const outputDir = getProjectEditOutputDir(runtime, project);
    await ensureOutputDirectory(runtime, requestId, outputDir);

    const format = getImageExtension(readStringSetting(settings, "format", "png"));
    const layout = resolveComparisonLayout(payload, settings);
    const mode = resolveComparisonRenderMode(payload, layout);
    const splitMode = readStringSetting(settings, "splitMode", "primary-left-reference-right");
    const splitPercent = asNumber(payload["comparisonSplitPercent"]) ?? 50;
    const includeRoiDetail = readBooleanSetting(settings, "includeRoiDetail", true);
    const detailRoiFilters = includeRoiDetail
      ? buildComparisonDetailRoiFilters(payload)
      : { primary: null, reference: null, shared: null };
    const outputFileName = `${options.filePrefix}-${options.timestamp}.${format}`;
    const outputPath = `${outputDir}/${outputFileName}`;
    const primaryAssetId = getComparisonPrimaryAssetId(source, payload);
    const captureContext = buildComparisonCaptureContext({
      payload,
      primaryAssetId,
      referenceAssetId: reference.asset.id,
      settings,
    });

    await runTool(
      runtime,
      requestId,
      jobId,
      "ffmpeg",
      outputDir,
      [
        "-y",
        "-i",
        primaryPath,
        "-i",
        reference.localPath,
        "-filter_complex",
        buildImagePairFilterComplex({
          detailRoiFilter: detailRoiFilters.shared,
          layout,
          mode,
          primaryDetailRoiFilter: detailRoiFilters.primary,
          referenceDetailRoiFilter: detailRoiFilters.reference,
          size: 720,
          splitMode,
          splitPercent,
        }),
        "-map",
        "[out]",
        "-frames:v",
        "1",
        ...(() => {
          const args: string[] = [];
          appendImageQualityArgs(args, format, 92);
          return args;
        })(),
        outputPath,
      ],
      90 * 1000,
      "ffmpeg comparison capture failed."
    );

    return registerOutputAsset(runtime, project, {
      type: "image",
      name: outputFileName,
      localPath: outputPath,
      ...getOperationSourceAssetLink(project, payload),
      metadata: {
        action: options.action,
        artifactKind: options.artifactKind,
        captureContext,
        comparisonViewMode: captureContext.comparisonViewMode,
        evidenceRole: "derived",
        fileName: outputFileName,
        findingId: options.findingId || null,
        flowKind: "operation-result",
        operationId: "image-comparison",
        primaryAssetId,
        referenceAssetId: reference.asset.id,
        requestId,
        settingsUsed: settings,
        toolId: "ffmpeg",
      },
    });
  }

  async function captureComparisonMoment(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for comparison capture.");
    }
    const projectId = getProjectId(project);
    const jobId = `capture-comparison-moment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "capture-comparison-moment",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });
    pushJobState(api, {
      action: "capture-comparison-moment",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });
    try {
      const timestamp = Date.now();
      const asset = await renderComparisonCaptureAsset(
        runtime,
        project,
        requestId,
        jobId,
        payload,
        {
          action: "capture-comparison-moment",
          artifactKind: "comparison-moment-snapshot",
          filePrefix: "comparison-moment",
          timestamp,
        }
      );
      pushJobState(api, {
        action: "capture-comparison-moment",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [asset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });
      return { outputFileName: asset.name, outputPath: asNonEmptyString(asset.localPath) };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "capture-comparison-moment",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function saveComparisonFinding(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for comparison finding.");
    }
    const projectId = getProjectId(project);
    const jobId = `save-comparison-finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "save-comparison-finding",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });
    pushJobState(api, {
      action: "save-comparison-finding",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });
    try {
      const timestamp = Date.now();
      const findingId = `comparison-finding-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
      const snapshotAsset = await renderComparisonCaptureAsset(
        runtime,
        project,
        requestId,
        jobId,
        payload,
        {
          action: "save-comparison-finding",
          artifactKind: "comparison-finding-snapshot",
          filePrefix: "comparison-finding-snapshot",
          findingId,
          timestamp,
        }
      );
      const outputDir = getProjectEditOutputDir(runtime, project);
      await ensureOutputDirectory(runtime, requestId, outputDir);
      const source = getOperationSourceRecord(project, payload);
      const reference = readComparisonReference(project, payload);
      const settings = readOperationSettings("image-comparison", payload);
      const primaryAssetId = getComparisonPrimaryAssetId(source, payload);
      const note = asNonEmptyString(payload["findingNote"]) || "";
      const manifestFileName = `comparison-finding-${timestamp}.json`;
      const manifestPath = `${outputDir}/${manifestFileName}`;
      const captureContext = buildComparisonCaptureContext({
        payload,
        primaryAssetId,
        referenceAssetId: reference.asset.id,
        settings,
      });
      const comparisonRois = buildComparisonRoisContext(payload);
      const roiSummary = buildComparisonRoiSummary(comparisonRois);
      const manifestPayload = {
        artifactKind: "comparison-finding-manifest",
        captureContext,
        ...(comparisonRois === null
          ? {}
          : {
              comparisonRoiActiveSide: comparisonRois.activeSide,
              comparisonRois,
            }),
        createdAt: new Date(timestamp).toISOString(),
        findingId,
        note,
        operationId: "image-comparison",
        primaryAssetId,
        referenceAssetId: reference.asset.id,
        requestId,
        ...(roiSummary === null ? {} : { roiSummary }),
        snapshotAssetId: snapshotAsset.id,
      };
      await writeLaboratoryTextFile(manifestPath, `${JSON.stringify(manifestPayload, null, 2)}\n`);
      const manifestAsset = await registerOutputAsset(runtime, project, {
        type: "artifact",
        name: manifestFileName,
        localPath: manifestPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "save-comparison-finding",
          artifactKind: "comparison-finding-manifest",
          captureContext,
          comparisonViewMode: captureContext.comparisonViewMode,
          evidenceRole: "derived",
          fileName: manifestFileName,
          findingId,
          flowKind: "operation-result",
          note,
          operationId: "image-comparison",
          primaryAssetId,
          referenceAssetId: reference.asset.id,
          requestId,
          ...(comparisonRois === null
            ? {}
            : {
                comparisonRoiActiveSide: comparisonRois.activeSide,
                comparisonRois,
              }),
          ...(roiSummary === null ? {} : { roiSummary }),
          settingsUsed: settings,
          snapshotAssetId: snapshotAsset.id,
          toolId: "ffmpeg",
        },
      });
      pushJobState(api, {
        action: "save-comparison-finding",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [snapshotAsset.id, manifestAsset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });
      return {
        outputFileNames: [snapshotAsset.name, manifestAsset.name],
        outputPaths: [snapshotAsset.localPath, manifestAsset.localPath],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "save-comparison-finding",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function exportTimelineClip(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for clip export.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const storedPath = asNonEmptyString(source["storedPath"]);
    if (storedPath === null) {
      throw new Error("No source file available for clip export.");
    }

    const sourceKind = asNonEmptyString(source["kind"]) || "video";
    if (sourceKind !== "video") {
      throw new Error("Clip export is only available for video sources.");
    }

    const startMs = asNumber(payload["startMs"]) || 0;
    const endMs = asNumber(payload["endMs"]);
    if (endMs === null || endMs <= startMs) {
      throw new Error("Invalid timeline selection for clip export.");
    }
    const durationSec = (endMs - startMs) / 1000;
    const settings = readOperationSettings("clip-export", payload);
    const applyRoiCrop = readBooleanSetting(settings, "applyRoiCrop", false);

    const normalizedCrop = applyRoiCrop
      ? resolveNormalizedCropPixels(source, payload["normalizedRoi"])
      : null;
    if (applyRoiCrop && hasNormalizedRoiPayload(payload) && normalizedCrop === null) {
      throw new Error("Source dimensions are required for normalized ROI clip export.");
    }
    const cropRegion = normalizedCrop || (payload["cropRegion"] as LaboratoryRecord | undefined);
    const hasCrop =
      applyRoiCrop &&
      cropRegion &&
      typeof cropRegion["width"] === "number" &&
      typeof cropRegion["height"] === "number" &&
      cropRegion["width"] > 0 &&
      cropRegion["height"] > 0;

    await cancelJobsForProject(runtime, projectId, requestId, {
      actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
    });

    const jobId = `export-clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-timeline-clip",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: "export-timeline-clip",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      const format = readStringSetting(settings, "format", "mp4");
      const outputFileName = `clip-${String(Math.round(startMs))}-${String(Math.round(endMs))}ms-${Date.now()}.${format}`;
      const outputPath = `${outputDir}/${outputFileName}`;
      const filters: string[] = [];

      const args: string[] = [
        "-y",
        "-ss",
        String(startMs / 1000),
        "-i",
        storedPath,
        "-t",
        String(durationSec),
      ];

      if (hasCrop) {
        const cx = Number(cropRegion["x"]);
        const cy = Number(cropRegion["y"]);
        const cw = Number(cropRegion["width"]);
        const ch = Number(cropRegion["height"]);
        filters.push(`crop=${String(cw)}:${String(ch)}:${String(cx)}:${String(cy)}`);
      }
      const fpsFilter = getFpsFilter(readStringSetting(settings, "fps", "source"));
      const scaleFilter = getScaleFilter(readStringSetting(settings, "scale", "source"));
      if (fpsFilter !== null) {
        filters.push(fpsFilter);
      }
      if (scaleFilter !== null) {
        filters.push(scaleFilter);
      }
      if (filters.length > 0) {
        args.push("-filter:v", filters.join(","));
      }

      if (format === "gif") {
        args.push(outputPath);
      } else if (format === "webm") {
        args.push(
          "-c:v",
          "libvpx-vp9",
          "-crf",
          getCrfForQuality(readStringSetting(settings, "quality", "balanced")),
          "-b:v",
          "0"
        );
        if (readBooleanSetting(settings, "includeAudio", true)) {
          args.push("-c:a", "libopus");
        } else {
          args.push("-an");
        }
        args.push(outputPath);
      } else {
        args.push(
          "-c:v",
          "libx264",
          "-crf",
          getCrfForQuality(readStringSetting(settings, "quality", "balanced"))
        );
        if (readBooleanSetting(settings, "includeAudio", true)) {
          args.push("-c:a", "aac");
        } else {
          args.push("-an");
        }
        args.push(outputPath);
      }

      const runResult = toRecord(
        await callRoomTools({
          args,
          cwd: outputDir,
          jobId,
          operation: "tool-run",
          requestId,
          roomId: asNonEmptyString(runtime["roomId"]) || "laboratory",
          timeoutMs: 5 * 60 * 1000,
          toolId: "ffmpeg",
        })
      );

      const runPayload = toRecord(runResult["run"]);
      assertToolRunSucceeded(runPayload, "ffmpeg clip export failed.");

      const createdAsset = await registerOutputAsset(runtime, project, {
        type: "clip",
        name: outputFileName,
        localPath: outputPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "export-timeline-clip",
          durationMs: endMs - startMs,
          endMs,
          evidenceRole: "derived",
          fileName: outputFileName,
          filterPreset: hasCrop ? "clip-export-crop" : "clip-export",
          flowKind: "operation-result",
          operationId: "clip-export",
          requestId,
          settingsUsed: settings,
          sourceRange: {
            endMs,
            startMs,
          },
          startMs,
          toolId: "ffmpeg",
          ...(hasCrop
            ? {
                cropPixels: {
                  height: Number(cropRegion["height"]),
                  width: Number(cropRegion["width"]),
                  x: Number(cropRegion["x"]),
                  y: Number(cropRegion["y"]),
                },
              }
            : {}),
        },
      });
      pushJobState(api, {
        action: "export-timeline-clip",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [createdAsset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        outputPath,
        outputFileName,
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-timeline-clip", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-timeline-clip",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function exportStabilizedClip(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for stabilized clip export.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const storedPath = asNonEmptyString(source["storedPath"]);
    if (storedPath === null) {
      throw new Error("No source file available for stabilized clip export.");
    }
    if ((asNonEmptyString(source["kind"]) || "video") !== "video") {
      throw new Error("Stabilized clip export is only available for video sources.");
    }

    const startMs = asNumber(payload["startMs"]) || 0;
    const endMs = asNumber(payload["endMs"]);
    if (endMs === null || endMs <= startMs) {
      throw new Error("Invalid timeline selection for stabilized clip export.");
    }
    const durationSec = (endMs - startMs) / 1000;
    const settings = readOperationSettings("segment-stabilization", payload);

    await cancelJobsForProject(runtime, projectId, requestId, {
      actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
    });

    const jobId = `export-stabilized-clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-stabilized-clip",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: "export-stabilized-clip",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      await ensureOutputDirectory(runtime, requestId, outputDir);
      const outputFileName = `stabilized-${String(Math.round(startMs))}-${String(Math.round(endMs))}ms-${Date.now()}.mp4`;
      const outputPath = `${outputDir}/${outputFileName}`;
      const transformsPath = `${outputDir}/stabilize-transforms-${Date.now()}.trf`;
      const shakinessSetting = readStringSetting(settings, "shakiness", "medium");
      const shakiness = shakinessSetting === "high" ? 10 : shakinessSetting === "low" ? 4 : 7;
      const smoothing = Math.round(readNumberSetting(settings, "smoothing", 12));
      const cropMode = readStringSetting(settings, "cropMode", "keep");
      const transformOptions =
        cropMode === "adaptive"
          ? [`input=${transformsPath}`, `smoothing=${String(smoothing)}`, "crop=black", "optzoom=2"]
          : cropMode === "fixed"
            ? [`input=${transformsPath}`, `smoothing=${String(smoothing)}`, "crop=keep", "zoom=5"]
            : [
                `input=${transformsPath}`,
                `smoothing=${String(smoothing)}`,
                "crop=keep",
                "optzoom=1",
              ];

      await runTool(
        runtime,
        requestId,
        jobId,
        "ffmpeg",
        outputDir,
        [
          "-y",
          "-ss",
          String(startMs / 1000),
          "-i",
          storedPath,
          "-t",
          String(durationSec),
          "-vf",
          `vidstabdetect=shakiness=${String(shakiness)}:accuracy=15:result=${transformsPath}`,
          "-f",
          "null",
          "-",
        ],
        5 * 60 * 1000,
        "ffmpeg stabilization analysis failed."
      );

      await runTool(
        runtime,
        requestId,
        jobId,
        "ffmpeg",
        outputDir,
        [
          "-y",
          "-ss",
          String(startMs / 1000),
          "-i",
          storedPath,
          "-t",
          String(durationSec),
          "-vf",
          `vidstabtransform=${transformOptions.join(":")}`,
          "-c:v",
          "libx264",
          "-crf",
          getCrfForQuality(readStringSetting(settings, "quality", "balanced")),
          "-c:a",
          "aac",
          outputPath,
        ],
        10 * 60 * 1000,
        "ffmpeg stabilized clip export failed."
      );

      const createdAsset = await registerOutputAsset(runtime, project, {
        type: "clip",
        name: outputFileName,
        localPath: outputPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "export-stabilized-clip",
          durationMs: endMs - startMs,
          endMs,
          evidenceRole: "derived",
          fileName: outputFileName,
          flowKind: "operation-result",
          operationId: "segment-stabilization",
          requestId,
          settingsUsed: settings,
          sourceRange: {
            endMs,
            startMs,
          },
          startMs,
          toolId: "ffmpeg",
          transformsPath,
        },
      });
      pushJobState(api, {
        action: "export-stabilized-clip",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [createdAsset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        outputPath,
        outputFileName,
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-stabilized-clip", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-stabilized-clip",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function exportStemSeparation(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for stem separation.");
    }

    const projectId = getProjectId(project);
    const source = getOperationSourceRecord(project, payload);
    const storedPath = asNonEmptyString(source["storedPath"]);
    if (storedPath === null) {
      throw new Error("No source file available for stem separation.");
    }
    const sourceKind = asNonEmptyString(source["kind"]) || "video";
    if (sourceKind !== "video" && sourceKind !== "audio") {
      throw new Error("Stem separation is only available for video or audio sources.");
    }
    if (sourceAudioAvailability(sourceKind, source) !== "ready") {
      throw new Error("Stem separation requires a ready audio stream.");
    }

    const settings = readOperationSettings("stem-separation", payload);

    await cancelJobsForProject(runtime, projectId, requestId, {
      actionIds: Array.from(MEDIA_EXPORT_ACTION_IDS),
    });

    const jobId = `export-stem-separation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "export-stem-separation",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "demucs",
    });

    pushJobState(api, {
      action: "export-stem-separation",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "demucs",
    });

    try {
      const outputDir = getProjectEditOutputDir(runtime, project);
      await ensureOutputDirectory(runtime, requestId, outputDir);
      const timestamp = Date.now();
      const modelName = readStringSetting(settings, "model", "htdemucs");
      const device = readStringSetting(settings, "device", "cpu");
      const stemsMode = readStringSetting(settings, "stems", "all");
      const preparedInputBase = `operation-demucs-input-${timestamp}`;
      const preparedInputPath = `${outputDir}/${preparedInputBase}.wav`;
      const stemDir = `${outputDir}/separated/${modelName}/${preparedInputBase}`;

      await runTool(
        runtime,
        requestId,
        jobId,
        "ffmpeg",
        outputDir,
        ["-y", "-i", storedPath, "-vn", "-ac", "2", "-ar", "44100", preparedInputPath],
        4 * 60 * 1000,
        "ffmpeg stem input preparation failed."
      );

      await runTool(
        runtime,
        requestId,
        jobId,
        "demucs",
        outputDir,
        [
          "-m",
          "demucs",
          "-d",
          device,
          "-n",
          modelName,
          ...(stemsMode === "all" ? [] : ["--two-stems", stemsMode]),
          preparedInputPath,
        ],
        30 * 60 * 1000,
        "Demucs stem separation failed."
      );

      const stemEntries = (await listLaboratoryDirectory(stemDir))
        .filter(function (entry) {
          return entry.isDirectory !== true && /\.(wav|mp3|flac|ogg|m4a)$/i.test(entry.name);
        })
        .map(function (entry) {
          return {
            fileName: entry.name,
            path: entry.path || `${stemDir}/${entry.name}`,
            stemName: entry.name.replace(/\.[^.]+$/, "") || entry.name,
          };
        });
      if (stemEntries.length === 0) {
        throw new Error("Demucs finished without producing stem files.");
      }

      const createdAssets = await stemEntries.reduce<Promise<LabAsset[]>>(async function (
        previousAssets,
        stem
      ) {
        const assets = await previousAssets;
        const asset = await registerOutputAsset(runtime, project, {
          type: "audio",
          name: stem.fileName,
          localPath: stem.path,
          ...getOperationSourceAssetLink(project, payload),
          metadata: {
            action: "export-stem-separation",
            evidenceRole: "derived",
            flowKind: "operation-result",
            modelName,
            operationId: "stem-separation",
            requestId,
            settingsUsed: settings,
            stemName: stem.stemName,
            stemsMode,
            toolId: "demucs",
          },
        });
        return assets.concat(asset);
      }, Promise.resolve([]));

      const manifestPath = `${outputDir}/stem-separation-${timestamp}.json`;
      const manifestFileName = manifestPath.split(/[\\/]/).pop() || "stem-separation.json";
      await writeLaboratoryTextFile(
        manifestPath,
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            operationId: "stem-separation",
            modelName,
            device,
            stemsMode,
            settingsUsed: settings,
            preparedInputPath,
            stemDir,
            stems: stemEntries,
          },
          null,
          2
        )}\n`
      );
      const manifestAsset = await registerOutputAsset(runtime, project, {
        type: "artifact",
        name: manifestFileName,
        localPath: manifestPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "export-stem-separation",
          artifactKind: "stem-separation-manifest",
          evidenceRole: "derived",
          flowKind: "operation-result",
          operationId: "stem-separation",
          requestId,
          toolId: "demucs",
        },
      });
      createdAssets.push(manifestAsset);

      pushJobState(api, {
        action: "export-stem-separation",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: createdAssets.map(function (asset) {
          return asset.id;
        }),
        stage: "completed",
        toolId: "demucs",
      });

      return {
        outputFileNames: createdAssets.map(function (asset) {
          return asset.name;
        }),
        outputPaths: createdAssets.map(function (asset) {
          return asNonEmptyString(asset.localPath);
        }),
      };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "export-stem-separation", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      pushJobState(api, {
        action: "export-stem-separation",
        jobId,
        message: errorMessage,
        projectId,
        requestId,
        stage: "failed",
        toolId: "demucs",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  const { exportAudioTrack, exportBandPassVoice, exportCleanAudio } = createMediaAudioExportActions(
    {
      asNonEmptyString,
      asNumber,
      assertToolRunSucceeded,
      callRoomTools,
      cancelJobsForProject,
      clearJob,
      getActiveProject,
      getAudioChannelCount,
      getAudioCodecForFormat,
      getOperationSourceAssetLink,
      getOperationSourceRecord,
      getProjectEditOutputDir,
      getProjectId,
      getSourceDurationMs,
      isOperationCancelledError,
      pushCancelledJobState,
      pushJobState,
      readOperationSettings,
      registerJob,
      registerOutputAsset,
      sourceAudioAvailability,
      toRecord,
    }
  );

  return {
    captureComparisonMoment,
    exportAudioTrack,
    exportBandPassVoice,
    exportBeforeAfterVariant,
    exportCleanAudio,
    exportEnhancedFrame,
    exportImageComparison,
    exportROIImage,
    exportFrameGrab,
    saveComparisonFinding,
    exportStabilizedClip,
    exportStemSeparation,
    exportTimelineClip,
  };
}
