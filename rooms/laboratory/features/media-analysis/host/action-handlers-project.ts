import { removeLabAssetById } from "../../../shared/host/lab-assets.js";

type MediaProjectActionApi = Record<string, unknown>;
type MediaProjectRuntimeRecord = {
  activeProjectId?: string | null;
} & Record<string, unknown>;

type ProjectDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  cancelJobById: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    jobId: string,
    requestId: string
  ) => Promise<unknown>;
  cancelJobsForProject: (
    runtime: MediaProjectRuntimeRecord,
    projectId: string,
    requestId: string,
    options?: { actionIds?: string[] }
  ) => Promise<unknown>;
  cancelFeatureProcess: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    workbenchSource?: unknown
  ) => Promise<unknown>;
  createProject: (runtime: MediaProjectRuntimeRecord, featureId: string | null) => Promise<unknown>;
  checkToolUpdates: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    toolId: string,
    featureStage: string | null
  ) => Promise<unknown>;
  checkAllToolUpdates: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureStage: string | null
  ) => Promise<unknown>;
  deleteProject: (
    runtime: MediaProjectRuntimeRecord,
    projectId: string | null,
    requestId: string,
    featureId: string | null
  ) => Promise<unknown>;
  ensureProjectExists: (
    runtime: MediaProjectRuntimeRecord,
    featureId: string | null
  ) => Promise<unknown>;
  exportFeatureReport: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    actionPayload?: Record<string, unknown>
  ) => Promise<unknown>;
  handleToolMutation: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    action: string | null,
    toolId: string,
    featureStage: string | null
  ) => Promise<unknown>;
  patchActiveProject: (
    runtime: MediaProjectRuntimeRecord,
    patcher: (project: Record<string, unknown>) => Record<string, unknown>
  ) => Promise<unknown>;
  refreshActiveProjectMetadata: (
    runtime: MediaProjectRuntimeRecord,
    requestId: string
  ) => Promise<unknown>;
  refreshToolStatus: (runtime: MediaProjectRuntimeRecord) => Promise<unknown>;
  runFeatureProcess: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    workbenchSource?: unknown
  ) => Promise<unknown>;
  updateAllTools: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureStage: string | null
  ) => Promise<unknown>;
  updateSelectedTools: (
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    toolIds: string[],
    featureStage: string | null
  ) => Promise<unknown>;
};

export function createMediaProjectActionRuntime(deps: ProjectDeps) {
  const {
    asNonEmptyString,
    cancelJobById,
    cancelJobsForProject,
    cancelFeatureProcess,
    checkAllToolUpdates,
    checkToolUpdates,
    createProject: createProjectRecord,
    deleteProject: deleteProjectRecord,
    ensureProjectExists,
    exportFeatureReport,
    handleToolMutation,
    patchActiveProject,
    refreshActiveProjectMetadata,
    refreshToolStatus,
    runFeatureProcess,
    updateAllTools,
    updateSelectedTools,
  } = deps;

  function toToolIdList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function (entry) {
        return asNonEmptyString(entry);
      })
      .filter((entry): entry is string => entry !== null);
  }

  async function refresh(runtime: MediaProjectRuntimeRecord, requestId: string) {
    runtime.activeProjectId = null;
    await refreshToolStatus(runtime);
    return refreshActiveProjectMetadata(runtime, requestId);
  }

  async function refreshTools(runtime: MediaProjectRuntimeRecord) {
    return refreshToolStatus(runtime);
  }

  async function createProject(runtime: MediaProjectRuntimeRecord, featureId: string | null) {
    return createProjectRecord(runtime, featureId);
  }

  async function clearProject(runtime: MediaProjectRuntimeRecord, requestId: string) {
    runtime.activeProjectId = null;
    return refreshActiveProjectMetadata(runtime, requestId);
  }

  async function selectProject(
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    actionPayload: Record<string, unknown>
  ) {
    const rawResetSourceState = actionPayload["resetSourceState"];
    const resetSourceState =
      typeof rawResetSourceState === "object" && rawResetSourceState !== null
        ? (rawResetSourceState as Record<string, unknown>)
        : null;
    runtime.activeProjectId = asNonEmptyString(actionPayload["projectId"]);
    await ensureProjectExists(runtime, featureId);
    if (resetSourceState !== null && Object.keys(resetSourceState).length > 0) {
      await patchActiveProject(runtime, function (project) {
        return {
          ...project,
          source: {
            ...resetSourceState,
          },
        };
      });
    }
    return refreshActiveProjectMetadata(runtime, requestId);
  }

  async function deleteProject(
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    actionPayload: Record<string, unknown>
  ) {
    return deleteProjectRecord(
      runtime,
      asNonEmptyString(actionPayload["projectId"]),
      requestId,
      featureId
    );
  }

  async function renameProject(
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    _featureId: string | null,
    actionPayload: Record<string, unknown>
  ) {
    const newName = asNonEmptyString(actionPayload["name"]);
    if (newName) {
      await deps.patchActiveProject(runtime, function (project) {
        return {
          ...project,
          name: newName,
        };
      });
    }
    return refreshActiveProjectMetadata(runtime, requestId);
  }

  async function runProcess(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    workbenchSource?: unknown
  ) {
    return runFeatureProcess(api, runtime, requestId, featureId, workbenchSource);
  }

  async function cancelProcess(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    workbenchSource?: unknown
  ) {
    return cancelFeatureProcess(api, runtime, requestId, featureId, workbenchSource);
  }

  async function cancelJob(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    actionPayload: Record<string, unknown>
  ) {
    const jobId = asNonEmptyString(actionPayload["jobId"]);
    if (jobId !== null) {
      await cancelJobById(api, runtime, jobId, requestId);
    } else {
      const actionId = asNonEmptyString(actionPayload["actionId"]);
      const projectId =
        asNonEmptyString(actionPayload["projectId"]) || runtime.activeProjectId || null;
      if (actionId !== null && projectId !== null) {
        await cancelJobsForProject(runtime, projectId, requestId, { actionIds: [actionId] });
      }
    }
    return refreshActiveProjectMetadata(runtime, requestId);
  }

  async function exportReport(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureId: string | null,
    actionPayload: Record<string, unknown> = {}
  ) {
    return exportFeatureReport(api, runtime, requestId, featureId, actionPayload);
  }

  async function removeAsset(
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    actionPayload: Record<string, unknown>
  ) {
    const assetId =
      asNonEmptyString(actionPayload["assetId"]) || asNonEmptyString(actionPayload["id"]);
    if (assetId === null) {
      throw new Error("Asset id is required.");
    }
    await patchActiveProject(runtime, function (project) {
      return {
        ...project,
        assets: removeLabAssetById(project["assets"], assetId),
      };
    });
    return refreshActiveProjectMetadata(runtime, requestId);
  }

  async function mutateTool(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    action: string | null,
    actionPayload: Record<string, unknown>,
    featureStage: string
  ) {
    await handleToolMutation(
      api,
      runtime,
      requestId,
      action,
      asNonEmptyString(actionPayload["toolId"]) as string,
      featureStage || "source"
    );
    return null;
  }

  async function checkTool(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    actionPayload: Record<string, unknown>,
    featureStage: string
  ) {
    const toolId = asNonEmptyString(actionPayload["toolId"]);
    if (toolId === null) {
      throw new Error("Tool id is required.");
    }
    await checkToolUpdates(api, runtime, requestId, toolId, featureStage || "source");
    return null;
  }

  async function checkTools(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureStage: string
  ) {
    await checkAllToolUpdates(api, runtime, requestId, featureStage || "source");
    return null;
  }

  async function updateTools(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    featureStage: string
  ) {
    await updateAllTools(api, runtime, requestId, featureStage || "source");
    return null;
  }

  async function updateSelected(
    api: MediaProjectActionApi,
    runtime: MediaProjectRuntimeRecord,
    requestId: string,
    actionPayload: Record<string, unknown>,
    featureStage: string
  ) {
    await updateSelectedTools(
      api,
      runtime,
      requestId,
      toToolIdList(actionPayload["toolIds"]),
      featureStage || "source"
    );
    return null;
  }

  return {
    cancelJob,
    cancelProcess,
    checkTool,
    checkTools,
    clearProject,
    createProject,
    deleteProject,
    exportReport,
    mutateTool,
    removeAsset,
    refresh,
    refreshTools,
    renameProject,
    runProcess,
    selectProject,
    updateSelected,
    updateTools,
  };
}
