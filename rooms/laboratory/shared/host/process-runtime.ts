import { createLaboratoryManagedProcessRunnersRuntime } from "./process-managed-runners.js";
import { extractFindings } from "../../services/finding-engine.js";
import { freezeAnalysisScope } from "../types/analysis-scope.js";
import { normalizeLabAnalysisSettingsMap } from "../../domain/lab-types.js";
import { createLaboratoryProcessOutputHelpers } from "./process-output-assets.js";
import { createLabOutputAsset, findLabAssetById, upsertLabAsset } from "./lab-assets.js";
import { getLabPathExtension, inferLabSourceKindFromUrl } from "../lab-asset-kind.js";

interface LaboratoryProcessDeps {
  appendProcessEvent: (
    record: Record<string, unknown>,
    event: Record<string, unknown>
  ) => Record<string, unknown>;
  asNonEmptyString: (value: unknown) => string | null;
  buildAudioAnalysisModules: (
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    target: Record<string, unknown>
  ) => unknown[];
  buildMediaProcessModules: (
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    target: Record<string, unknown>
  ) => unknown[];
  callRoomTools?: (payload: Record<string, unknown>) => Promise<unknown>;
  cancelProcessJobsForProject: (
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    projectId: string,
    requestId: string,
    action?: string
  ) => Promise<void>;
  clearJob: (runtime: Record<string, unknown>, jobId: string) => void;
  clone: <T>(value: T) => T;
  composeFeatureReport: (
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    featureId: string
  ) => unknown;
  createEmptyFeatureProcessRecord: (featureId: string) => Record<string, unknown>;
  createEmptyProcessRun: (featureId: string) => Record<string, unknown>;
  ensureEditToolReady: (runtime: Record<string, unknown>) => void;
  ensureProcessJobSlotAvailable: (
    runtime: Record<string, unknown>,
    projectId: string,
    action: string
  ) => void;
  ensureProjectDirectories: (
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string
  ) => Promise<void>;
  getActiveProject: (runtime: Record<string, unknown>) => Record<string, unknown> | null;
  getFeatureProcessDir: (
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    featureId: string
  ) => string;
  getProjectSourceDir?: (
    runtime: Record<string, unknown>,
    project: Record<string, unknown>
  ) => string;
  getFeatureProcessJobAction: (featureId: string) => string;
  getFeatureProcessRecord: (
    project: Record<string, unknown>,
    featureId: string
  ) => Record<string, unknown>;
  patchActiveProject: (
    runtime: Record<string, unknown>,
    fn: (project: Record<string, unknown>) => Record<string, unknown>
  ) => Promise<void>;
  pushJobState: (api: Record<string, unknown>, state: Record<string, unknown>) => void;
  registerJob: (runtime: Record<string, unknown>, job: Record<string, unknown>) => void;
  resolveProcessRunFeatureIds: (
    project: Record<string, unknown>,
    featureId: string,
    workbenchSource?: unknown
  ) => string[];
  resolveProcessWorkbench: (
    project: Record<string, unknown>,
    featureId: string,
    workbenchSource?: unknown
  ) => Record<string, unknown>;
  resolveProcessTarget: (
    project: Record<string, unknown>,
    featureId: string
  ) => Record<string, unknown>;
  sanitizeFileSegment: (value: string, kind: string) => string;
  setFeatureProcessRecord: (
    project: Record<string, unknown>,
    featureId: string,
    record: Record<string, unknown>
  ) => void;
  setFeatureReportRecord: (
    project: Record<string, unknown>,
    featureId: string,
    report: unknown
  ) => void;
  toRecord: (value: unknown) => Record<string, unknown>;
  updateProcessRecordPercent: (record: Record<string, unknown>) => void;
  markFeatureReportStale: (
    project: Record<string, unknown>,
    featureId: string,
    reason: string
  ) => void;
  audioFeatureId: string;
  [key: string]: unknown;
}

type LaboratoryManagedProcessRunnersRuntimeDeps = Parameters<
  typeof createLaboratoryManagedProcessRunnersRuntime
>[0];

const PROCESS_CANCELLATION_STATE_KEY = "__laboratoryProcessCancellationRequests";
const PROCESS_CANCELLED_MESSAGE = "Calisma kullanici tarafindan iptal edildi.";

class LaboratoryProcessCancelledError extends Error {
  constructor() {
    super(PROCESS_CANCELLED_MESSAGE);
    this.name = "LaboratoryProcessCancelledError";
  }
}

export function createLaboratoryProcessRuntime(deps: LaboratoryProcessDeps) {
  const {
    appendProcessEvent,
    asNonEmptyString,
    buildAudioAnalysisModules,
    buildMediaProcessModules,
    callRoomTools,
    cancelProcessJobsForProject,
    clearJob,
    clone,
    composeFeatureReport,
    createEmptyProcessRun,
    ensureEditToolReady,
    ensureProcessJobSlotAvailable,
    ensureProjectDirectories,
    getActiveProject,
    getFeatureProcessDir,
    getProjectSourceDir,
    getFeatureProcessJobAction,
    getFeatureProcessRecord,
    patchActiveProject,
    pushJobState,
    registerJob,
    resolveProcessRunFeatureIds,
    resolveProcessWorkbench,
    resolveProcessTarget,
    sanitizeFileSegment,
    setFeatureProcessRecord,
    setFeatureReportRecord,
    toRecord,
    updateProcessRecordPercent,
    markFeatureReportStale,
    audioFeatureId,
  } = deps;

  function shouldPersistProcessWorkbench(workbenchSource: unknown) {
    void workbenchSource;
    return true;
  }

  function isRemoteProcessUrl(value: string | null) {
    if (value === null) {
      return false;
    }
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
      return false;
    }
  }

  function getPathLeaf(path: string | null) {
    if (path === null) {
      return null;
    }
    return path.split(/[\\/]/).pop() || path;
  }

  function getRemoteDownloadFileName(urlValue: string, fallbackKind: string) {
    let leaf: string | null;
    try {
      const parsedUrl = new URL(urlValue);
      leaf = decodeURIComponent(parsedUrl.pathname.split("/").pop() || "");
    } catch {
      leaf = getPathLeaf(urlValue);
    }
    const cleanLeaf = asNonEmptyString(
      (leaf || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
    );
    const fallbackExtension =
      fallbackKind === "image" ? "png" : fallbackKind === "audio" ? "mp3" : "mp4";
    const fileName = cleanLeaf || `remote-${fallbackKind}.${fallbackExtension}`;
    return getLabPathExtension(fileName) === null ? `${fileName}.${fallbackExtension}` : fileName;
  }

  function getRemoteAssetType(sourceKind: string) {
    if (sourceKind === "image") {
      return "image" as const;
    }
    if (sourceKind === "audio") {
      return "audio" as const;
    }
    return "clip" as const;
  }

  function getProcessTargetRecordSourceKind(target: Record<string, unknown>) {
    const metadata = toRecord(target["metadata"]);
    const directKind =
      asNonEmptyString(target["sourceKind"]) ||
      asNonEmptyString(metadata["sourceKind"]) ||
      asNonEmptyString(metadata["kind"]);
    if (directKind === "image" || directKind === "audio" || directKind === "video") {
      return directKind;
    }
    const targetType = asNonEmptyString(target["type"]);
    if (targetType === "image" || targetType === "frame") {
      return "image";
    }
    if (targetType === "audio") {
      return "audio";
    }
    const targetUrl =
      asNonEmptyString(target["url"]) ||
      asNonEmptyString(target["localPath"]) ||
      asNonEmptyString(target["path"]);
    return targetUrl === null ? "video" : inferLabSourceKindFromUrl(targetUrl);
  }

  function toDownloadedFileRecord(value: unknown) {
    return toRecord(toRecord(value)["download"]);
  }

  async function materializeRemoteAnalysisTargets(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    action: string,
    workbench: Record<string, unknown>
  ) {
    if (typeof callRoomTools !== "function" || typeof getProjectSourceDir !== "function") {
      return { project, workbench };
    }

    const downloadTool = callRoomTools;
    const resolveProjectSourceDir = getProjectSourceDir;
    let nextProject = project;
    let nextWorkbench = { ...workbench };
    const downloadedByUrl = new Map<string, Record<string, unknown>>();
    const projectId = getProjectId(project);
    const roomId = asNonEmptyString(deps["roomId"]) || "laboratory";

    async function downloadRemoteTarget(
      target: Record<string, unknown>,
      fallbackName: string
    ): Promise<Record<string, unknown> | null> {
      const existingLocalPath =
        asNonEmptyString(target["localPath"]) || asNonEmptyString(target["path"]);
      if (existingLocalPath !== null) {
        return target;
      }
      const urlValue = asNonEmptyString(target["url"]);
      if (isRemoteProcessUrl(urlValue) !== true || urlValue === null) {
        return null;
      }
      const cached = downloadedByUrl.get(urlValue);
      if (cached !== undefined) {
        return cached;
      }

      const sourceKind = getProcessTargetRecordSourceKind(target);
      const fileName =
        asNonEmptyString(target["fileName"]) ||
        asNonEmptyString(target["name"]) ||
        getRemoteDownloadFileName(urlValue, sourceKind);
      pushJobState(api, {
        requestId,
        jobId,
        action,
        projectId,
        featureStage: "process",
        stage: "downloading",
        message: "Remote analysis target is being downloaded.",
      });
      const downloadResult = await downloadTool({
        operation: "download-file",
        roomId,
        requestId,
        jobId,
        url: urlValue,
        destinationPath: `${resolveProjectSourceDir(runtime, nextProject)}/${fileName}`,
        overwrite: false,
      });
      const downloaded = toDownloadedFileRecord(downloadResult);
      const localPath = asNonEmptyString(downloaded["path"]);
      if (localPath === null) {
        throw new Error("Remote analysis target download did not return a local path.");
      }
      const downloadedFileName =
        asNonEmptyString(downloaded["fileName"]) || getPathLeaf(localPath) || fileName;
      const sourceAssetId = asNonEmptyString(target["assetId"]);
      const sourceAsset =
        sourceAssetId === null ? null : findLabAssetById(nextProject, sourceAssetId);
      const sourceAssetRecord =
        sourceAsset === null ? {} : (sourceAsset as unknown as Record<string, unknown>);
      const outputType = getRemoteAssetType(sourceKind);
      const materializedMetadata = {
        ...toRecord(sourceAssetRecord["metadata"]),
        ...toRecord(target["metadata"]),
        evidenceRole: "source",
        flowKind: "remote-url-import",
        kind: sourceKind,
        remoteSourceUrl: urlValue,
        sourceKind,
      };
      const materializedAsset =
        sourceAsset !== null && asNonEmptyString(sourceAssetRecord["type"]) === outputType
          ? {
              ...sourceAsset,
              localPath,
              metadata: materializedMetadata,
              name: downloadedFileName || sourceAsset.name || fallbackName,
              url: urlValue,
            }
          : createLabOutputAsset(nextProject, {
              type: outputType,
              name: downloadedFileName || fallbackName,
              localPath,
              url: urlValue,
              derivedFromAssetId: sourceAssetId,
              metadata: materializedMetadata,
            });
      nextProject = {
        ...nextProject,
        assets: upsertLabAsset(nextProject["assets"], materializedAsset),
      };
      const materializedTarget = {
        ...target,
        assetId: materializedAsset.id,
        fileName: downloadedFileName,
        label: asNonEmptyString(target["label"]) || materializedAsset.name,
        localPath,
        name: materializedAsset.name,
        path: localPath,
        sourceKind,
        type: materializedAsset.type,
      };
      downloadedByUrl.set(urlValue, materializedTarget);
      return materializedTarget;
    }

    async function materializeWorkbenchAssetId(key: string) {
      const assetId = asNonEmptyString(nextWorkbench[key]);
      const asset = assetId === null ? null : findLabAssetById(nextProject, assetId);
      if (asset === null || asNonEmptyString(asset.localPath) !== null) {
        return;
      }
      const materializedTarget = await downloadRemoteTarget(
        {
          assetId: asset.id,
          label: asset.name,
          metadata: asset.metadata,
          name: asset.name,
          type: asset.type,
          url: asset.url,
        },
        asset.name
      );
      if (materializedTarget !== null) {
        nextWorkbench[key] = materializedTarget["assetId"];
      }
    }

    await materializeWorkbenchAssetId("workspaceTargetAssetId");
    await materializeWorkbenchAssetId("comparisonReferenceAssetId");

    const analysisScope = toRecord(nextWorkbench["analysisScope"]);
    const comparison = toRecord(analysisScope["comparison"]);
    if (Object.keys(comparison).length > 0) {
      const primary = await downloadRemoteTarget(toRecord(comparison["primary"]), "Primary image");
      const reference = await downloadRemoteTarget(
        toRecord(comparison["reference"]),
        "Reference image"
      );
      if (primary !== null || reference !== null) {
        nextWorkbench = {
          ...nextWorkbench,
          analysisScope: {
            ...analysisScope,
            comparison: {
              ...comparison,
              ...(primary === null ? {} : { primary }),
              ...(reference === null ? {} : { reference }),
            },
          },
        };
        if (primary !== null) {
          nextWorkbench["workspaceTargetAssetId"] = primary["assetId"];
        }
        if (reference !== null) {
          nextWorkbench["comparisonReferenceAssetId"] = reference["assetId"];
        }
      }
    }

    if (nextProject !== project) {
      await patchActiveProject(runtime, function (currentProject: Record<string, unknown>) {
        if (currentProject["id"] !== project["id"]) {
          return currentProject;
        }
        return {
          ...currentProject,
          assets: nextProject["assets"],
          workbench: nextWorkbench,
        };
      });
    }

    return { project: nextProject, workbench: nextWorkbench };
  }

  const managedProcessRunnersDeps = {
    asNonEmptyString: deps["asNonEmptyString"],
    buildProcessSpeechAvailability: deps["buildProcessSpeechAvailability"],
    clampProfileTranscriptSampleSeconds: deps["clampProfileTranscriptSampleSeconds"],
    clone: deps["clone"],
    createProcessArtifact: deps["createProcessArtifact"],
    createProcessFinding: deps["createProcessFinding"],
    generateProcessFramePreviewArtifact: deps["generateProcessFramePreviewArtifact"],
    generateProcessImageComparisonArtifact: deps["generateProcessImageComparisonArtifact"],
    generateProcessMetadataArtifact: deps["generateProcessMetadataArtifact"],
    generateProcessSpectrogram: deps["generateProcessSpectrogram"],
    generateProcessVisualTransformArtifact: deps["generateProcessVisualTransformArtifact"],
    getAudioAnalysisModuleProcessDir: deps["getAudioAnalysisModuleProcessDir"],
    getAudioAnalysisModuleRunner: deps["getAudioAnalysisModuleRunner"],
    maybeRunTranscriptProfileSample: deps["maybeRunTranscriptProfileSample"],
    normalizeProcessArtifact: deps["normalizeProcessArtifact"],
    normalizeProcessFinding: deps["normalizeProcessFinding"],
    partitionVisualAnalysisModuleIds: deps["partitionVisualAnalysisModuleIds"],
    resolveEnabledVisualAnalysisModuleIds: deps["resolveEnabledVisualAnalysisModuleIds"],
    runAudioStructureProbe: deps["runAudioStructureProbe"],
    runVideoStructureProbe: deps["runVideoStructureProbe"],
    sanitizeFileSegment: deps["sanitizeFileSegment"],
    toRecord: deps["toRecord"],
    updateProcessModule: deps["updateProcessModule"],
    writeJsonFile: deps["writeJsonFile"],
    writeTextFile: deps["writeTextFile"],
  };
  const laboratoryManagedProcessRunnersRuntime = createLaboratoryManagedProcessRunnersRuntime(
    managedProcessRunnersDeps as unknown as LaboratoryManagedProcessRunnersRuntimeDeps
  );
  const { deriveProcessEmptyReason, syncProcessOutputsToProjectAssets } =
    createLaboratoryProcessOutputHelpers({
      asNonEmptyString,
      audioFeatureId,
      toRecord,
    });

  function appendRunLifecycleEvent(
    record: Record<string, unknown>,
    action: string,
    stage: "running" | "completed" | "failed" | "cancelled",
    detail: string | null,
    options: {
      kind?: "activity" | "request-result";
      message?: string;
      severity?: "info" | "success" | "warning" | "error";
    } = {}
  ) {
    return appendProcessEvent(record, {
      kind: options.kind || "activity",
      severity:
        options.severity ||
        (stage === "completed"
          ? "success"
          : stage === "failed"
            ? "error"
            : stage === "cancelled"
              ? "warning"
              : "info"),
      message:
        options.message ||
        (stage === "completed"
          ? "Analiz tamamlandi"
          : stage === "failed"
            ? "Analiz hata verdi"
            : stage === "cancelled"
              ? "Analiz iptal edildi"
              : "Analiz basladi"),
      detail,
      action,
      stage,
      scope: "run",
    });
  }

  function getProjectId(project: Record<string, unknown>) {
    return asNonEmptyString(project["id"]) || String(project["id"] || "");
  }

  function getProcessCancellationState(runtime: Record<string, unknown>) {
    const current = runtime[PROCESS_CANCELLATION_STATE_KEY];
    if (current !== null && typeof current === "object" && Array.isArray(current) === false) {
      return current as Record<string, Record<string, unknown>>;
    }

    const nextState: Record<string, Record<string, unknown>> = {};
    runtime[PROCESS_CANCELLATION_STATE_KEY] = nextState;
    return nextState;
  }

  function getProcessCancellationKey(projectId: string, featureId: string) {
    return `${projectId}:${featureId}`;
  }

  function requestProcessCancellation(
    runtime: Record<string, unknown>,
    projectId: string,
    featureId: string,
    requestId: string
  ) {
    if (projectId === "" || featureId === "") {
      return;
    }

    getProcessCancellationState(runtime)[getProcessCancellationKey(projectId, featureId)] = {
      requestId,
      projectId,
      featureId,
      cancelledAt: new Date().toISOString(),
    };
  }

  function clearProcessCancellation(
    runtime: Record<string, unknown>,
    projectId: string,
    featureId: string
  ) {
    delete getProcessCancellationState(runtime)[getProcessCancellationKey(projectId, featureId)];
  }

  function isProcessCancellationRequested(
    runtime: Record<string, unknown>,
    projectId: string,
    featureId: string
  ) {
    return (
      getProcessCancellationState(runtime)[getProcessCancellationKey(projectId, featureId)] !==
      undefined
    );
  }

  function throwIfProcessCancellationRequested(
    runtime: Record<string, unknown>,
    projectId: string,
    featureId: string
  ) {
    if (isProcessCancellationRequested(runtime, projectId, featureId)) {
      throw new LaboratoryProcessCancelledError();
    }
  }

  function isProcessCancelledError(error: unknown) {
    return error instanceof Error && error.name === "LaboratoryProcessCancelledError";
  }

  function logCancellationWarning(api: Record<string, unknown>, error: unknown) {
    const log = api["log"];
    if (typeof log !== "function") {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    (log as (level: string, message: string) => void)(
      "warn",
      `Laboratory process cancellation cleanup failed: ${message}`
    );
  }

  function collectCancellableProcessFeatureIds(
    project: Record<string, unknown>,
    fallbackFeatureId: string
  ) {
    const records = toRecord(toRecord(project["process"])["records"]);
    const featureIds = Object.keys(records).filter(function (recordFeatureId) {
      const status = String(toRecord(records[recordFeatureId])["status"] || "");
      return status === "running" || status === "queued";
    });
    if (fallbackFeatureId !== "" && featureIds.includes(fallbackFeatureId) !== true) {
      featureIds.push(fallbackFeatureId);
    }
    return featureIds;
  }

  function cancelProcessRecord(record: Record<string, unknown>, action: string) {
    const cancelledRecord = {
      ...record,
      status: "cancelled",
      jobId: null,
      requestId: null,
      error: null,
    };
    appendRunLifecycleEvent(cancelledRecord, action, "cancelled", PROCESS_CANCELLED_MESSAGE, {
      message: "Analiz iptal edildi",
      severity: "warning",
    });
    appendRunLifecycleEvent(cancelledRecord, action, "cancelled", PROCESS_CANCELLED_MESSAGE, {
      kind: "request-result",
      message: "Analiz istegi iptal edildi",
      severity: "warning",
    });
    return cancelledRecord;
  }

  async function runManagedProcess(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    featureId: string,
    outputDir: string
  ) {
    const target = resolveProcessTarget(project, featureId);
    const action = getFeatureProcessJobAction(featureId);
    const projectId = getProjectId(project);
    throwIfProcessCancellationRequested(runtime, projectId, featureId);
    if (target["path"] === null) {
      throw new Error("Prepare a valid target before starting the process stage.");
    }

    const artifactBase = sanitizeFileSegment(
      `${project["slug"]}-${featureId}-${Date.now()}`,
      featureId === audioFeatureId ? "audio-process" : "media-process"
    );
    const processRecord = createEmptyProcessRun(featureId);
    processRecord["status"] = "running";
    processRecord["requestId"] = requestId;
    processRecord["jobId"] = jobId;
    processRecord["projectId"] = projectId;
    processRecord["runId"] = `${featureId}-run-${Date.now()}`;
    processRecord["startedAt"] = new Date().toISOString();
    processRecord["events"] = [];
    processRecord["rawLog"] = [];
    processRecord["emptyReason"] = null;
    processRecord["liveFindings"] = [];
    processRecord["previewArtifacts"] = [];
    processRecord["moduleTrace"] = [];
    processRecord["comparisonVariants"] = [];
    processRecord["confidence"] = null;
    processRecord["targetSummary"] = {
      requestedMode: target["requestedMode"],
      mode: target["mode"],
      outputId: target["outputId"],
      signature: target["signature"],
      label: target["label"],
      fileName: target["fileName"],
      mimeType: target["mimeType"],
      path: target["path"],
      entryCount: Array.isArray(target["entries"]) ? target["entries"].length : null,
    };
    processRecord["analysisScope"] = freezeAnalysisScope(
      toRecord(toRecord(project["workbench"])["analysisScope"]),
      processRecord["runId"] as string,
      processRecord["startedAt"] as string
    );
    processRecord["analysisSettings"] = normalizeLabAnalysisSettingsMap(
      toRecord(toRecord(project["workbench"])["analysisSettings"])
    );
    processRecord["hypothesisSummary"] = asNonEmptyString(
      toRecord(toRecord(processRecord["analysisScope"]))["hypothesis"]
    );
    processRecord["modules"] =
      featureId === audioFeatureId
        ? buildAudioAnalysisModules(runtime, project, target)
        : buildMediaProcessModules(runtime, project, target);
    function appendProcessCollection(
      key: string,
      entry: Record<string, unknown>,
      limit: number,
      dedupeKey: string = "id"
    ) {
      const entries = Array.isArray(processRecord[key])
        ? (processRecord[key] as unknown[]).map(function (value) {
            return toRecord(value);
          })
        : [];
      const nextKey = asNonEmptyString(entry[dedupeKey]);
      const filteredEntries =
        nextKey === null
          ? entries
          : entries.filter(function (value) {
              return asNonEmptyString(toRecord(value)[dedupeKey]) !== nextKey;
            });
      filteredEntries.unshift(entry);
      processRecord[key] = filteredEntries.slice(0, limit);
    }

    function emitManagedRuntimeUpdate(payload: Record<string, unknown>) {
      throwIfProcessCancellationRequested(runtime, projectId, featureId);
      const kind = asNonEmptyString(payload["kind"]) || "module-progress";
      const detail = asNonEmptyString(payload["detail"]);
      if (kind === "live-finding") {
        const finding = toRecord(payload["finding"]);
        if (Object.keys(finding).length > 0) {
          appendProcessCollection(
            "liveFindings",
            {
              ...finding,
              emittedAt: Date.now(),
              windowKey: asNonEmptyString(payload["throttleWindow"]),
              streamId: featureId,
              hypothesis:
                asNonEmptyString(finding["hypothesis"]) ||
                asNonEmptyString(processRecord["hypothesisSummary"]),
            },
            80
          );
        }
      }
      if (kind === "preview-artifact") {
        const artifact = toRecord(payload["artifact"]);
        if (Object.keys(artifact).length > 0) {
          appendProcessCollection(
            "previewArtifacts",
            {
              ...artifact,
              active: artifact["active"] !== false,
              status: asNonEmptyString(artifact["status"]) || "ready",
              variantId: asNonEmptyString(toRecord(payload["comparisonVariant"])["id"]) || null,
            },
            48
          );
        }
      }
      if (kind === "module-warning" && detail !== null) {
        const warningList = Array.isArray(processRecord["warnings"])
          ? (processRecord["warnings"] as unknown[]).map(String)
          : [];
        processRecord["warnings"] = Array.from(new Set(warningList.concat(detail)));
      }
      const moduleTrace = toRecord(payload["moduleTrace"]);
      if (Object.keys(moduleTrace).length > 0) {
        appendProcessCollection("moduleTrace", moduleTrace, 120);
      }
      const comparisonVariant = toRecord(payload["comparisonVariant"]);
      if (Object.keys(comparisonVariant).length > 0) {
        appendProcessCollection("comparisonVariants", comparisonVariant, 32);
      }
      if (Array.isArray(payload["comparisonVariants"])) {
        (payload["comparisonVariants"] as unknown[]).forEach(function (entry) {
          const nextVariant = toRecord(entry);
          if (Object.keys(nextVariant).length > 0) {
            appendProcessCollection("comparisonVariants", nextVariant, 32);
          }
        });
      }
      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: action,
        projectId: project["id"],
        toolId: "ffmpeg",
        featureStage: "process",
        stage: asNonEmptyString(payload["stage"]) || "running",
        ...payload,
        analysisScope: processRecord["analysisScope"],
      });
    }
    appendRunLifecycleEvent(
      processRecord,
      action,
      "running",
      typeof processRecord["targetSummary"] === "object" && processRecord["targetSummary"] !== null
        ? asNonEmptyString(toRecord(processRecord["targetSummary"])["label"])
        : null
    );
    emitManagedRuntimeUpdate({
      kind: "analysis-scope-updated",
      message: "Analysis scope locked for the current run.",
      detail: asNonEmptyString(processRecord["hypothesisSummary"]),
      analysisScope: processRecord["analysisScope"],
      moduleTrace: {
        id: `scope-${Date.now()}`,
        moduleId: null,
        stage: "process",
        status: "scope-frozen",
        timestamp: new Date().toISOString(),
        message: "Analysis scope locked for the current run.",
        detail: asNonEmptyString(processRecord["hypothesisSummary"]),
      },
      throttleWindow: `${featureId}-scope`,
    });
    const runtimeJobs = toRecord(runtime["jobs"]);
    const jobRecord = toRecord(runtimeJobs[jobId]);
    if (Object.keys(jobRecord).length > 0) {
      jobRecord["processRecordRef"] = processRecord;
    }

    const results =
      featureId === audioFeatureId
        ? await laboratoryManagedProcessRunnersRuntime.runAudioManagedProcess(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            processRecord,
            emitManagedRuntimeUpdate
          )
        : await laboratoryManagedProcessRunnersRuntime.runMediaManagedProcess(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            outputDir,
            processRecord,
            emitManagedRuntimeUpdate
          );

    throwIfProcessCancellationRequested(runtime, projectId, featureId);

    const collectedFindings = Array.isArray(results["findings"]) ? results["findings"] : [];
    const derivedFindings = extractFindings(
      (Array.isArray(processRecord["events"]) ? processRecord["events"] : []).map(function (entry) {
        return toRecord(entry);
      }) as never[]
    );
    const derivedFindingRecords = derivedFindings
      .filter(function (candidate) {
        return (
          collectedFindings.some(function (finding) {
            return toRecord(finding)["title"] === candidate.title;
          }) === false
        );
      })
      .map(function (candidate) {
        return {
          id: candidate.id,
          moduleId: candidate.moduleId,
          title: candidate.title,
          detail: candidate.detail,
          level: candidate.level,
          confidence: candidate.confidence,
          kind: candidate.kind,
          evidenceCount: candidate.evidenceCount,
          artifactIds: candidate.artifactIds,
        };
      });
    processRecord["findings"] = collectedFindings.concat(derivedFindingRecords);
    processRecord["artifacts"] = results["artifacts"];
    processRecord["warnings"] = results["warnings"];
    processRecord["status"] = "ready";
    processRecord["completedAt"] = new Date().toISOString();
    processRecord["emptyReason"] =
      Array.isArray(processRecord["findings"]) &&
      processRecord["findings"].length === 0 &&
      Array.isArray(processRecord["artifacts"]) &&
      processRecord["artifacts"].length === 0
        ? deriveProcessEmptyReason(featureId, processRecord)
        : null;
    appendRunLifecycleEvent(
      processRecord,
      action,
      "completed",
      processRecord["emptyReason"] as string | null,
      {
        message: "Analiz tamamlandi",
        severity: "success",
      }
    );
    appendRunLifecycleEvent(processRecord, action, "completed", null, {
      kind: "request-result",
      message: "Analiz istegi tamamlandi",
      severity: "success",
    });
    updateProcessRecordPercent(processRecord);
    return processRecord;
  }

  async function runSingleFeatureProcess(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    requestId: string,
    featureId: string,
    workbenchSource: unknown = {}
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    const workbench = resolveProcessWorkbench(project, featureId, workbenchSource);
    const persistProcessWorkbench = shouldPersistProcessWorkbench(workbenchSource);
    const projectId = getProjectId(project);

    ensureEditToolReady(runtime);
    throwIfProcessCancellationRequested(runtime, projectId, featureId);
    await ensureProjectDirectories(runtime, project, requestId);
    const action = getFeatureProcessJobAction(featureId);
    ensureProcessJobSlotAvailable(runtime, project["id"] as string, action);
    const jobId = `room-process-${featureId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    registerJob(runtime, {
      jobId: jobId,
      requestId: requestId,
      action: action,
      projectId: project["id"],
      toolId: "ffmpeg",
      featureStage: "process",
    });
    pushJobState(api, {
      requestId: requestId,
      jobId: jobId,
      action: action,
      projectId: project["id"],
      featureStage: "process",
      stage: "queued",
    });

    const materialized = await materializeRemoteAnalysisTargets(
      api,
      runtime,
      project,
      requestId,
      jobId,
      action,
      workbench
    );
    const processProject = materialized.project;
    const processWorkbench = materialized.workbench;

    await patchActiveProject(runtime, function (nextProject: Record<string, unknown>) {
      if (persistProcessWorkbench) {
        nextProject["workbench"] = processWorkbench;
      }
      setFeatureProcessRecord(nextProject, featureId, {
        ...createEmptyProcessRun(featureId),
        featureId: featureId,
        status: "running",
        jobId: jobId,
        requestId: requestId,
        percent: null,
      });
      markFeatureReportStale(nextProject, featureId, "A new process run is now in progress.");
      return nextProject;
    });

    try {
      const pendingFollowUp = { workbench: null as Record<string, unknown> | null };
      const nextProcessRecord = await runManagedProcess(
        api,
        runtime,
        {
          ...clone(processProject),
          workbench: processWorkbench,
        },
        requestId,
        jobId,
        featureId,
        getFeatureProcessDir(runtime, project, featureId)
      );
      throwIfProcessCancellationRequested(runtime, projectId, featureId);
      await patchActiveProject(runtime, function (nextProject: Record<string, unknown>) {
        const existingRecord = toRecord(getFeatureProcessRecord(nextProject, featureId));
        if (
          isProcessCancellationRequested(runtime, projectId, featureId) ||
          String(existingRecord["status"] || "") === "cancelled"
        ) {
          return nextProject;
        }
        const queuedProcessInstance = toRecord(existingRecord["queuedProcessInstance"]);
        setFeatureProcessRecord(nextProject, featureId, {
          ...nextProcessRecord,
          queuedProcessInstance: null,
        });
        if (Object.keys(queuedProcessInstance).length > 0) {
          pendingFollowUp.workbench = {
            ...processWorkbench,
            analysisScope: toRecord(queuedProcessInstance["analysisScope"]),
            moduleToggles: toRecord(queuedProcessInstance["moduleToggles"]),
          };
          if (persistProcessWorkbench) {
            nextProject["workbench"] = pendingFollowUp.workbench;
          }
        }
        const nextReportRecord = toRecord(composeFeatureReport(runtime, nextProject, featureId));
        setFeatureReportRecord(nextProject, featureId, nextReportRecord);
        return {
          ...nextProject,
          assets: syncProcessOutputsToProjectAssets(
            nextProject,
            featureId,
            nextProcessRecord,
            nextReportRecord
          ),
        };
      });
      const latestProject = getActiveProject(runtime);
      const latestRecord =
        latestProject === null ? {} : getFeatureProcessRecord(latestProject, featureId);
      if (
        isProcessCancellationRequested(runtime, projectId, featureId) ||
        String(latestRecord["status"] || "") === "cancelled"
      ) {
        throw new LaboratoryProcessCancelledError();
      }
      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: action,
        projectId: project["id"],
        toolId: "ffmpeg",
        featureStage: "process",
        stage: "completed",
      });
      if (pendingFollowUp.workbench !== null) {
        await runSingleFeatureProcess(
          api,
          runtime,
          `${requestId}-queued-${Date.now()}`,
          featureId,
          pendingFollowUp.workbench
        );
      }
    } catch (error) {
      const currentProject = getActiveProject(runtime);
      const currentRecord =
        currentProject === null ? {} : getFeatureProcessRecord(currentProject, featureId);
      const wasCancelled =
        isProcessCancelledError(error) ||
        isProcessCancellationRequested(runtime, projectId, featureId) ||
        String(currentRecord["status"] || "") === "cancelled";
      await patchActiveProject(runtime, function (nextProject: Record<string, unknown>) {
        const existingRecord = getFeatureProcessRecord(nextProject, featureId);
        if (wasCancelled || String(existingRecord["status"] || "") === "cancelled") {
          setFeatureProcessRecord(
            nextProject,
            featureId,
            cancelProcessRecord(existingRecord, action)
          );
          return nextProject;
        }
        const failedRecord = {
          ...existingRecord,
          status: "failed",
          jobId: null,
          requestId: null,
          error: error instanceof Error ? error.message : String(error),
        };
        appendRunLifecycleEvent(
          failedRecord,
          action,
          "failed",
          error instanceof Error ? error.message : String(error),
          {
            message: "Analiz hata verdi",
            severity: "error",
          }
        );
        appendRunLifecycleEvent(
          failedRecord,
          action,
          "failed",
          error instanceof Error ? error.message : String(error),
          {
            kind: "request-result",
            message: "Analiz istegi hata verdi",
            severity: "error",
          }
        );
        setFeatureProcessRecord(nextProject, featureId, failedRecord);
        return nextProject;
      });
      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: action,
        projectId: project["id"],
        featureStage: "process",
        stage: wasCancelled ? "cancelled" : "failed",
        message: wasCancelled
          ? PROCESS_CANCELLED_MESSAGE
          : error instanceof Error
            ? error.message
            : String(error),
      });
      throw wasCancelled ? new LaboratoryProcessCancelledError() : error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function runFeatureProcess(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    requestId: string,
    featureId: string,
    workbenchSource: unknown = {}
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    const workbench = resolveProcessWorkbench(project, featureId, workbenchSource);
    const runFeatureIds = resolveProcessRunFeatureIds(project, featureId, workbenchSource);
    const persistProcessWorkbench = shouldPersistProcessWorkbench(workbenchSource);
    const projectId = getProjectId(project);
    if (runFeatureIds.length === 0) {
      throw new Error("Select at least one analysis module before starting the process stage.");
    }
    runFeatureIds.forEach(function (runFeatureId) {
      clearProcessCancellation(runtime, projectId, runFeatureId);
    });

    await patchActiveProject(runtime, function (nextProject: Record<string, unknown>) {
      if (persistProcessWorkbench) {
        nextProject["workbench"] = workbench;
      }
      runFeatureIds.slice(1).forEach(function (queuedFeatureId) {
        setFeatureProcessRecord(nextProject, queuedFeatureId, {
          ...createEmptyProcessRun(queuedFeatureId),
          featureId: queuedFeatureId,
          status: "queued",
          requestId: requestId,
          percent: null,
        });
        markFeatureReportStale(
          nextProject,
          queuedFeatureId,
          "A new process run is now in progress."
        );
      });
      return nextProject;
    });

    const errors: Error[] = [];
    const cancelled = await runFeatureIds.reduce(async function (
      previousRun,
      nextFeatureId
    ): Promise<boolean> {
      const previousCancelled = await previousRun;
      if (previousCancelled || isProcessCancellationRequested(runtime, projectId, nextFeatureId)) {
        return true;
      }
      try {
        await runSingleFeatureProcess(api, runtime, requestId, nextFeatureId, workbench);
        return false;
      } catch (error) {
        if (
          isProcessCancelledError(error) ||
          isProcessCancellationRequested(runtime, projectId, nextFeatureId)
        ) {
          return true;
        }
        errors.push(
          error instanceof Error
            ? error
            : new Error(typeof error === "string" ? error : "Process run failed.")
        );
        return false;
      }
    }, Promise.resolve(false));

    if (cancelled) {
      return { cancelled: true };
    }

    if (errors.length === runFeatureIds.length) {
      const firstError = errors[0];
      throw firstError instanceof Error ? firstError : new Error("Process run failed.");
    }

    if (errors.length > 0) {
      await patchActiveProject(runtime, function (nextProject: Record<string, unknown>) {
        nextProject["process"] = {
          ...toRecord(nextProject["process"]),
          lastError: errors
            .map(function (entry) {
              return entry.message;
            })
            .join(" | "),
          lastActionAt: new Date().toISOString(),
        };
        return nextProject;
      });
    }

    return null;
  }

  async function cancelFeatureProcess(
    api: Record<string, unknown>,
    runtime: Record<string, unknown>,
    requestId: string,
    featureId: string,
    workbenchSource: unknown = {}
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    const workbench = resolveProcessWorkbench(project, featureId, workbenchSource);
    const persistProcessWorkbench = shouldPersistProcessWorkbench(workbenchSource);
    const projectId = getProjectId(project);
    const cancellableFeatureIds = collectCancellableProcessFeatureIds(
      project,
      asNonEmptyString(featureId) || ""
    );
    cancellableFeatureIds.forEach(function (cancelledFeatureId) {
      requestProcessCancellation(runtime, projectId, cancelledFeatureId, requestId);
    });
    await patchActiveProject(runtime, function (nextProject: Record<string, unknown>) {
      if (persistProcessWorkbench) {
        nextProject["workbench"] = workbench;
      }
      const records = toRecord(toRecord(nextProject["process"])["records"]);
      Object.keys(records).forEach(function (recordFeatureId) {
        const existingRecord = getFeatureProcessRecord(nextProject, recordFeatureId);
        if (!["running", "queued"].includes(String(existingRecord["status"] || ""))) {
          return;
        }
        requestProcessCancellation(runtime, projectId, recordFeatureId, requestId);
        setFeatureProcessRecord(
          nextProject,
          recordFeatureId,
          cancelProcessRecord(existingRecord, getFeatureProcessJobAction(recordFeatureId))
        );
      });
      return nextProject;
    });
    void cancelProcessJobsForProject(api, runtime, projectId, requestId).catch(function (error) {
      logCancellationWarning(api, error);
    });
    return { cancelled: true };
  }

  return {
    cancelFeatureProcess,
    runFeatureProcess,
    runManagedProcess,
    runSingleFeatureProcess,
  };
}
