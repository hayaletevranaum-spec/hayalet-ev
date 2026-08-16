import type { createMediaActionRuntime } from "../../features/media-analysis/host/action-handlers.js";

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryMediaActionRuntime = ReturnType<typeof createMediaActionRuntime>;

type LaboratoryRuntimeRecord = {
  activeProjectId?: string | null;
} & LaboratoryRecord;

type LaboratoryRoomApi = LaboratoryRecord & {
  log: (level: string, message: string) => void;
};

type LaboratoryActionEnvelope = LaboratoryRecord & {
  action?: unknown;
  payload?: unknown;
  requestId?: unknown;
};

type LaboratoryActionPayload = LaboratoryRecord & {
  featureId?: unknown;
  featureStage?: unknown;
  fields?: unknown;
};

type LaboratoryActionRouterDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  createRequestId: () => string;
  ensureHydrated: (api: LaboratoryRoomApi, runtime: LaboratoryRuntimeRecord) => Promise<unknown>;
  getFeatureIdFromContext: (payload: unknown) => string | null;
  loadContext: (api: LaboratoryRoomApi) => LaboratoryRecord;
  mediaActionRuntime: LaboratoryMediaActionRuntime;
  persistProfileModelState: (runtime: LaboratoryRuntimeRecord) => Promise<unknown> | unknown;
  persistToolState: (runtime: LaboratoryRuntimeRecord) => Promise<unknown> | unknown;
  pushActionResult: (
    api: LaboratoryRoomApi,
    payload: {
      action: string;
      cancelled?: boolean;
      error?: string;
      requestId: string;
      result?: unknown;
      success: boolean;
    }
  ) => void;
  pushMediaState: (
    api: LaboratoryRoomApi,
    runtime: LaboratoryRuntimeRecord,
    requestId: string,
    action: string
  ) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryActionRouter(deps: LaboratoryActionRouterDeps) {
  const {
    asNonEmptyString,
    createRequestId,
    ensureHydrated,
    getFeatureIdFromContext,
    loadContext,
    mediaActionRuntime,
    persistProfileModelState,
    persistToolState,
    pushActionResult,
    pushMediaState,
    toRecord,
  } = deps;

  function toActionEnvelope(value: unknown): LaboratoryActionEnvelope {
    return toRecord(value);
  }

  function toActionPayload(value: unknown): LaboratoryActionPayload {
    return toRecord(value);
  }

  function getProcessWorkbenchSource(
    api: LaboratoryRoomApi,
    actionPayload: LaboratoryActionPayload
  ) {
    const contextWorkbench = toRecord(toRecord(loadContext(api))["workbench"]);
    const payloadWorkbench = toRecord(actionPayload["workbench"]);
    const analysisScope =
      actionPayload["analysisScope"] === undefined
        ? payloadWorkbench["analysisScope"]
        : actionPayload["analysisScope"];
    const workspaceTargetAssetId = asNonEmptyString(actionPayload["workspaceTargetAssetId"]);
    const comparisonReferenceAssetId = asNonEmptyString(
      actionPayload["comparisonReferenceAssetId"]
    );
    return {
      ...contextWorkbench,
      ...payloadWorkbench,
      ...(analysisScope === undefined ? {} : { analysisScope }),
      ...(workspaceTargetAssetId === null ? {} : { workspaceTargetAssetId }),
      ...(comparisonReferenceAssetId === null ? {} : { comparisonReferenceAssetId }),
    };
  }

  async function dispatch(
    api: LaboratoryRoomApi,
    runtime: LaboratoryRuntimeRecord,
    payload: LaboratoryActionEnvelope
  ) {
    const actionEnvelope = toActionEnvelope(payload);
    const requestId = asNonEmptyString(actionEnvelope.requestId) || createRequestId();
    const action = asNonEmptyString(actionEnvelope.action);
    const actionPayload = toActionPayload(actionEnvelope.payload);
    const featureId =
      asNonEmptyString(actionPayload.featureId) || getFeatureIdFromContext(loadContext(api));

    if (action === null) {
      pushActionResult(api, {
        requestId,
        success: false,
        action: "",
        error: "Action is missing.",
      });
      return;
    }

    try {
      await ensureHydrated(api, runtime);
      let result: unknown = null;

      switch (action) {
        case "refresh":
          result = await mediaActionRuntime.refresh(runtime, requestId);
          break;
        case "tools-refresh":
          await mediaActionRuntime.refreshTools(runtime);
          break;
        case "project-create":
          await mediaActionRuntime.createProject(runtime, featureId);
          break;
        case "project-clear":
          await mediaActionRuntime.clearProject(runtime, requestId);
          break;
        case "project-select":
          await mediaActionRuntime.selectProject(runtime, requestId, featureId, actionPayload);
          break;
        case "project-delete":
          await mediaActionRuntime.deleteProject(runtime, requestId, featureId, actionPayload);
          break;
        case "project-rename":
          await mediaActionRuntime.renameProject(runtime, requestId, featureId, actionPayload);
          break;
        case "source-set-kind":
          await mediaActionRuntime.setSourceKind(runtime, actionPayload);
          break;
        case "source-set-mode":
          await mediaActionRuntime.setSourceMode(runtime, actionPayload);
          break;
        case "source-update-draft":
          await mediaActionRuntime.updateDrafts(runtime, toRecord(actionPayload["fields"]));
          break;
        case "source-pick-local":
          await mediaActionRuntime.pickLocal(api, runtime, requestId, actionPayload);
          break;
        case "source-download-url":
          result = await mediaActionRuntime.downloadUrl(api, runtime, requestId, actionPayload);
          break;
        case "source-download-youtube":
          result = await mediaActionRuntime.downloadYoutube(api, runtime, requestId, actionPayload);
          break;
        case "project-import-check-url":
          result = await mediaActionRuntime.checkProjectImportUrl(
            api,
            runtime,
            requestId,
            actionPayload
          );
          break;
        case "asset-remove":
          await mediaActionRuntime.removeAsset(runtime, requestId, actionPayload);
          break;
        case "edit-set-mode":
          await mediaActionRuntime.setEditMode(runtime, actionPayload);
          break;
        case "edit-apply-preset":
          await mediaActionRuntime.applyEditPreset(runtime, actionPayload);
          break;
        case "edit-update-recipe":
          await mediaActionRuntime.updateEditRecipe(runtime, actionPayload);
          break;
        case "edit-set-output":
          await mediaActionRuntime.setEditOutput(runtime, actionPayload);
          break;
        case "edit-set-handoff":
          await mediaActionRuntime.setEditHandoff(runtime, actionPayload);
          break;
        case "edit-preview":
          await mediaActionRuntime.previewEdit(api, runtime, requestId, actionPayload);
          break;
        case "edit-apply":
          await mediaActionRuntime.applyEdit(api, runtime, requestId, actionPayload);
          break;
        case "edit-cancel-preview":
          await mediaActionRuntime.cancelPreview(api, runtime, requestId);
          break;
        case "edit-cancel-apply":
          await mediaActionRuntime.cancelApply(api, runtime, requestId);
          break;
        case "export-roi-image":
          await mediaActionRuntime.exportROIImage(api, runtime, requestId, actionPayload);
          break;
        case "export-frame-grab":
          await mediaActionRuntime.exportFrameGrab(api, runtime, requestId, actionPayload);
          break;
        case "export-enhanced-frame":
          await mediaActionRuntime.exportEnhancedFrame(api, runtime, requestId, actionPayload);
          break;
        case "export-before-after-variant":
          await mediaActionRuntime.exportBeforeAfterVariant(api, runtime, requestId, actionPayload);
          break;
        case "export-image-comparison":
          await mediaActionRuntime.exportImageComparison(api, runtime, requestId, actionPayload);
          break;
        case "capture-comparison-moment":
          await mediaActionRuntime.captureComparisonMoment(api, runtime, requestId, actionPayload);
          break;
        case "save-comparison-finding":
          await mediaActionRuntime.saveComparisonFinding(api, runtime, requestId, actionPayload);
          break;
        case "export-timeline-clip":
          await mediaActionRuntime.exportTimelineClip(api, runtime, requestId, actionPayload);
          break;
        case "export-stabilized-clip":
          await mediaActionRuntime.exportStabilizedClip(api, runtime, requestId, actionPayload);
          break;
        case "export-audio-track":
          await mediaActionRuntime.exportAudioTrack(api, runtime, requestId, actionPayload);
          break;
        case "export-clean-audio":
          await mediaActionRuntime.exportCleanAudio(api, runtime, requestId, actionPayload);
          break;
        case "export-band-pass-voice":
          await mediaActionRuntime.exportBandPassVoice(api, runtime, requestId, actionPayload);
          break;
        case "export-stem-separation":
          await mediaActionRuntime.exportStemSeparation(api, runtime, requestId, actionPayload);
          break;
        case "profile-set-mode":
          await mediaActionRuntime.setProfileMode(runtime, actionPayload);
          break;
        case "profile-apply-preset":
          await mediaActionRuntime.applyProfilePreset(runtime, actionPayload);
          break;
        case "profile-update":
          await mediaActionRuntime.updateProfile(runtime, actionPayload);
          break;
        case "profile-set-target":
          await mediaActionRuntime.setProfileTarget(runtime, actionPayload);
          break;
        case "profile-set-model":
          await mediaActionRuntime.setProfileModel(runtime, actionPayload);
          break;
        case "profile-run-preflight":
          await mediaActionRuntime.runProfile(api, runtime, requestId, actionPayload);
          break;
        case "profile-cancel-preflight":
          await mediaActionRuntime.cancelProfile(api, runtime, requestId);
          break;
        case "profile-model-install":
          await mediaActionRuntime.installProfile(api, runtime, requestId, actionPayload);
          break;
        case "profile-model-remove":
          await mediaActionRuntime.removeProfile(runtime, requestId, actionPayload);
          break;
        case "process-run":
        case "audio-process-run":
          result = await mediaActionRuntime.runProcess(
            api,
            runtime,
            requestId,
            featureId,
            getProcessWorkbenchSource(api, actionPayload)
          );
          break;
        case "process-cancel":
        case "audio-process-cancel":
          await mediaActionRuntime.cancelProcess(api, runtime, requestId, featureId);
          break;
        case "job-cancel":
          await mediaActionRuntime.cancelJob(api, runtime, requestId, actionPayload);
          break;
        case "report-export":
        case "audio-report-export":
          result = await mediaActionRuntime.exportReport(
            api,
            runtime,
            requestId,
            featureId,
            actionPayload
          );
          break;
        case "tool-install":
        case "tool-update":
          await mediaActionRuntime.mutateTool(
            api,
            runtime,
            requestId,
            action,
            actionPayload,
            "tool-lifecycle"
          );
          break;
        case "tool-check-updates":
          await mediaActionRuntime.checkTool(
            api,
            runtime,
            requestId,
            actionPayload,
            "tool-lifecycle"
          );
          break;
        case "tool-check-all-updates":
          await mediaActionRuntime.checkTools(api, runtime, requestId, "tool-lifecycle");
          break;
        case "tool-update-selected":
          await mediaActionRuntime.updateSelected(
            api,
            runtime,
            requestId,
            actionPayload,
            "tool-lifecycle"
          );
          break;
        case "tool-update-all":
          await mediaActionRuntime.updateTools(api, runtime, requestId, "tool-lifecycle");
          break;
        default:
          throw new Error(`Unsupported media action: ${action}`);
      }

      await persistToolState(runtime);
      await persistProfileModelState(runtime);
      const resultRecord = toRecord(result);
      const cancelled = resultRecord["cancelled"] === true;
      pushMediaState(api, runtime, requestId, action);
      pushActionResult(api, {
        requestId,
        success: cancelled !== true,
        action,
        ...(cancelled ? { cancelled: true } : {}),
        ...(result !== null && result !== undefined ? { result } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      api.log("warn", `Laboratory media action failed: ${action} -> ${message}`);
      pushMediaState(api, runtime, requestId, action);
      pushActionResult(api, {
        requestId,
        success: false,
        action,
        error: message,
      });
    }
  }

  return {
    dispatch,
  };
}
