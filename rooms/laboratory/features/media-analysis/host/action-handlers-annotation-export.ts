import {
  createLabOutputAsset,
  findLabAssetById,
  upsertLabAsset,
} from "../../../shared/host/lab-assets.js";
import { inferLabAssetSourceKind } from "../../../shared/lab-asset-kind.js";
import { getLaboratoryElectronApi } from "../../../shared/host/electron-bridge.js";
import type { LabAsset } from "../../../domain/lab-types.js";
import {
  createMediaExportUtilities,
  type LaboratoryRecord,
} from "./action-handlers-export-utils.js";

type AnnotationTempElectronApi = {
  commandCleanupTemp: (payload: { tempPaths: string[] }) => Promise<{ success?: boolean }>;
  fmTempPath: (
    prefix: string,
    ext: string
  ) => Promise<{ message?: string; path?: string; success?: boolean }>;
  fmWriteFileAtomic: (payload: {
    data: string;
    encoding?: string;
    path: string;
  }) => Promise<{ message?: string; success?: boolean }>;
};

type MediaAnnotationExportRuntimeDeps = {
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
  toRecord: (value: unknown) => LaboratoryRecord;
  fallbackCaptureComparisonMoment: (
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) => Promise<unknown>;
};

function getAnnotationTempApi(): AnnotationTempElectronApi | null {
  const api = getLaboratoryElectronApi();
  if (api === null) {
    return null;
  }
  const candidate = api as unknown as Partial<AnnotationTempElectronApi>;
  if (
    typeof candidate.fmTempPath !== "function" ||
    typeof candidate.fmWriteFileAtomic !== "function" ||
    typeof candidate.commandCleanupTemp !== "function"
  ) {
    return null;
  }
  return candidate as AnnotationTempElectronApi;
}

function readPngDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const match = value.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match?.[1]) {
    return null;
  }
  if (match[1].length > 4_000_000) {
    throw new Error("Comparison annotation overlay is too large to export.");
  }
  return match[1];
}

export function createMediaAnnotationExportActionRuntime(deps: MediaAnnotationExportRuntimeDeps) {
  const {
    assertToolRunSucceeded,
    getCurrentMediaRunId,
    getOperationSourceAssetLink,
    getOperationSourceRecord,
    getProjectId,
    isOperationCancelledError,
    pushCancelledJobState,
    readOperationSettings,
  } = createMediaExportUtilities({
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: deps.asNumber,
    pushJobState: deps.pushJobState,
    toRecord: deps.toRecord,
  });

  function getRoomId(runtime: LaboratoryRecord) {
    return deps.asNonEmptyString(runtime["roomId"]) || "laboratory";
  }

  async function registerOutputAsset(
    runtime: LaboratoryRecord,
    inputProject: LaboratoryRecord,
    assetInput: Parameters<typeof createLabOutputAsset>[1]
  ): Promise<LabAsset> {
    let createdAsset: LabAsset | undefined;
    await deps.patchActiveProject(runtime, function (nextProject) {
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

  function readComparisonReference(project: LaboratoryRecord, payload: LaboratoryRecord) {
    const assetId = deps.asNonEmptyString(payload["comparisonReferenceAssetId"]);
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
    const localPath = deps.asNonEmptyString(asset.localPath);
    if (localPath === null) {
      throw new Error("Selected comparison reference is not available as a local file.");
    }
    return { asset, localPath };
  }

  async function writeAnnotationTempFile(base64Data: string): Promise<string> {
    const api = getAnnotationTempApi();
    if (api === null) {
      throw new Error("Electron temporary-file bridge is unavailable for annotation export.");
    }
    const tempResult = await api.fmTempPath("lab-comparison-annotations", "png");
    const tempPath = typeof tempResult.path === "string" ? tempResult.path.trim() : "";
    if (tempResult.success !== true || tempPath === "") {
      throw new Error(tempResult.message || "Could not allocate annotation overlay path.");
    }
    const writeResult = await api.fmWriteFileAtomic({
      data: base64Data,
      encoding: "base64",
      path: tempPath,
    });
    if (writeResult.success !== true) {
      throw new Error(writeResult.message || "Could not write annotation overlay.");
    }
    return tempPath;
  }

  async function cleanupAnnotationTempFile(tempPath: string | null) {
    if (tempPath === null) {
      return;
    }
    const api = getAnnotationTempApi();
    if (api === null) {
      return;
    }
    await api.commandCleanupTemp({ tempPaths: [tempPath] }).catch(function () {
      return undefined;
    });
  }

  async function captureMarkedSideBySide(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const project = deps.getActiveProject(runtime);
    if (project === null) {
      throw new Error("No active project for comparison export.");
    }
    const source = getOperationSourceRecord(project, payload);
    const primaryPath = deps.asNonEmptyString(source["storedPath"]);
    if (primaryPath === null || (deps.asNonEmptyString(source["kind"]) || "video") !== "image") {
      throw new Error("Comparison export requires a local primary image.");
    }
    const reference = readComparisonReference(project, payload);
    const settings = readOperationSettings("image-comparison", payload);
    const overlayBase64 = readPngDataUrl(settings["annotationOverlayDataUrl"]);
    const projectId = getProjectId(project);
    const jobId = `capture-comparison-marked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let annotationTempPath: string | null = null;

    deps.registerJob(runtime, {
      action: "capture-comparison-moment",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      toolId: "ffmpeg",
    });
    deps.pushJobState(api, {
      action: "capture-comparison-moment",
      featureStage: "edit",
      jobId,
      projectId,
      requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    try {
      const outputDir = deps.getProjectEditOutputDir(runtime, project);
      await deps.callRoomTools({
        operation: "ensure-dir",
        requestId,
        roomId: getRoomId(runtime),
        targetPath: outputDir,
      });
      if (overlayBase64 !== null) {
        annotationTempPath = await writeAnnotationTempFile(overlayBase64);
      }
      const timestamp = Date.now();
      const outputFileName = `comparison-side-by-side-${timestamp}.png`;
      const outputPath = `${outputDir}/${outputFileName}`;
      const filterParts = [
        "[0:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,setsar=1[p0]",
        "[1:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,setsar=1[p1]",
        "[p0][p1]hstack=inputs=2[base]",
        annotationTempPath === null ? "[base]null[out]" : "[base][2:v]overlay=0:0:format=auto[out]",
      ];
      const args = ["-y", "-i", primaryPath, "-i", reference.localPath];
      if (annotationTempPath !== null) {
        args.push("-i", annotationTempPath);
      }
      args.push(
        "-filter_complex",
        filterParts.join(";"),
        "-map",
        "[out]",
        "-frames:v",
        "1",
        outputPath
      );
      const runResult = deps.toRecord(
        await deps.callRoomTools({
          args,
          cwd: outputDir,
          jobId,
          operation: "tool-run",
          requestId,
          roomId: getRoomId(runtime),
          timeoutMs: 90 * 1000,
          toolId: "ffmpeg",
        })
      );
      assertToolRunSucceeded(
        deps.toRecord(runResult["run"]),
        "ffmpeg annotated comparison export failed."
      );

      const settingsUsed = { ...settings };
      delete settingsUsed["annotationOverlayDataUrl"];
      delete settingsUsed["drawingQuickExport"];
      const createdAsset = await registerOutputAsset(runtime, project, {
        type: "image",
        name: outputFileName,
        localPath: outputPath,
        ...getOperationSourceAssetLink(project, payload),
        metadata: {
          action: "capture-comparison-moment",
          annotated: annotationTempPath !== null,
          artifactKind: "comparison-moment-snapshot",
          captureContext: {
            captureMode: "side-by-side-export",
            comparisonViewMode: "side-by-side",
            layout: "side-by-side",
            primaryAssetId: deps.asNonEmptyString(payload["workspaceTargetAssetId"]),
            referenceAssetId: reference.asset.id,
          },
          comparisonViewMode: "side-by-side",
          evidenceRole: "derived",
          fileName: outputFileName,
          flowKind: "operation-result",
          operationId: "image-comparison",
          referenceAssetId: reference.asset.id,
          requestId,
          settingsUsed,
          toolId: "ffmpeg",
        },
      });
      deps.pushJobState(api, {
        action: "capture-comparison-moment",
        jobId,
        percent: 100,
        projectId,
        requestId,
        resultAssetIds: [createdAsset.id],
        stage: "completed",
        toolId: "ffmpeg",
      });
      return { outputFileName, outputPath };
    } catch (error) {
      if (isOperationCancelledError(error)) {
        pushCancelledJobState(api, "capture-comparison-moment", jobId, projectId, requestId);
        return { cancelled: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      deps.pushJobState(api, {
        action: "capture-comparison-moment",
        jobId,
        message,
        projectId,
        requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      await cleanupAnnotationTempFile(annotationTempPath);
      deps.clearJob(runtime, jobId);
    }
  }

  async function captureComparisonMoment(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    payload: LaboratoryRecord
  ) {
    const settings = readOperationSettings("image-comparison", payload);
    if (settings["drawingQuickExport"] !== true) {
      return deps.fallbackCaptureComparisonMoment(api, runtime, requestId, payload);
    }
    return captureMarkedSideBySide(api, runtime, requestId, payload);
  }

  return {
    captureComparisonMoment,
  };
}
