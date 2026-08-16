type LaboratoryRecord = Record<string, unknown>;

type LaboratoryEditPipelineMode = "apply" | "preview";

type LaboratoryMediaEditPipelineRuntime = LaboratoryRecord;

type LaboratoryProjectRecord = LaboratoryRecord & {
  edit?: unknown;
  id?: unknown;
  slug?: unknown;
  source?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  kind?: unknown;
};

type LaboratoryProjectEditRecord = LaboratoryRecord & {
  activeOutputId?: unknown;
  dirty?: unknown;
  handoffMode?: unknown;
  lastActionAt?: unknown;
  lastError?: unknown;
  outputs?: unknown;
  preview?: unknown;
};

type LaboratoryPreviewRecord = LaboratoryRecord & {
  path?: unknown;
  recipeSignature?: unknown;
  status?: unknown;
};

type LaboratoryRunPayloadRecord = LaboratoryRecord & {
  cancelled?: unknown;
  exitCode?: unknown;
  stderr?: unknown;
};

type LaboratoryEditOutputRecord = LaboratoryRecord & {
  id?: unknown;
};

type LaboratoryDerivedMetadataResult = {
  metadata: unknown;
  metadataError: string | null;
};

type LaboratoryEditPipelineDeps = {
  audioFeatureId: string;
  buildAuxiliaryArtifacts: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    project: LaboratoryProjectRecord,
    options: LaboratoryRecord
  ) => Promise<LaboratoryRecord[]>;
  buildEditCommand: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    project: LaboratoryProjectRecord,
    targetPath: string,
    mode: LaboratoryEditPipelineMode
  ) => string[];
  buildEditOutputLabel: (
    project: LaboratoryProjectRecord,
    mode: LaboratoryEditPipelineMode
  ) => string;
  buildEditTargetPath: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    project: LaboratoryProjectRecord,
    mode: LaboratoryEditPipelineMode
  ) => string;
  callRoomTools: (payload: LaboratoryRecord) => Promise<unknown>;
  clearJob: (runtime: LaboratoryMediaEditPipelineRuntime, jobId: string) => void;
  collectDerivedOutputMetadata: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    project: LaboratoryProjectRecord,
    options: LaboratoryRecord
  ) => Promise<LaboratoryDerivedMetadataResult>;
  ensureEditJobSlotAvailable: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    projectId: string,
    action: string
  ) => void;
  ensureEditToolReady: (runtime: LaboratoryMediaEditPipelineRuntime) => void;
  ensureProjectDirectories: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    project: LaboratoryProjectRecord,
    requestId: unknown
  ) => Promise<unknown>;
  getActiveProject: (runtime: LaboratoryMediaEditPipelineRuntime) => LaboratoryProjectRecord | null;
  getDerivedMimeType: (sourceKind: unknown) => string | null;
  getEditRecipeSignature: (project: LaboratoryProjectRecord) => string | null;
  getPreparedSourcePath: (project: LaboratoryProjectRecord) => string | null;
  getProjectEditDir: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  markCloseoutAsStale: (
    project: LaboratoryProjectRecord,
    reason: string,
    targetFeatureIds?: string[]
  ) => void;
  markProfileAsStale: (project: LaboratoryProjectRecord, reason: string) => void;
  normalizeEditOutput: (value: unknown) => LaboratoryEditOutputRecord;
  patchActiveProject: (
    runtime: LaboratoryMediaEditPipelineRuntime,
    updater: (project: LaboratoryProjectRecord) => LaboratoryProjectRecord
  ) => Promise<unknown>;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  registerJob: (runtime: LaboratoryMediaEditPipelineRuntime, payload: LaboratoryRecord) => void;
  requirePreparedSource: (project: LaboratoryProjectRecord) => void;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaEditPipelineRuntime(deps: LaboratoryEditPipelineDeps) {
  const {
    audioFeatureId,
    buildAuxiliaryArtifacts,
    buildEditCommand,
    buildEditOutputLabel,
    buildEditTargetPath,
    callRoomTools,
    clearJob,
    collectDerivedOutputMetadata,
    ensureEditJobSlotAvailable,
    ensureEditToolReady,
    ensureProjectDirectories,
    getActiveProject,
    getDerivedMimeType,
    getEditRecipeSignature,
    getPreparedSourcePath,
    getProjectEditDir,
    markCloseoutAsStale,
    markProfileAsStale,
    normalizeEditOutput,
    patchActiveProject,
    pushJobState,
    registerJob,
    requirePreparedSource,
    roomId,
    toRecord,
  } = deps;

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toProjectEditRecord(value: unknown): LaboratoryProjectEditRecord {
    return toRecord(value);
  }

  function toPreviewRecord(value: unknown): LaboratoryPreviewRecord {
    return toRecord(value);
  }

  function toRunPayloadRecord(value: unknown): LaboratoryRunPayloadRecord {
    return toRecord(value);
  }

  function toEditOutputRecord(value: unknown): LaboratoryEditOutputRecord {
    return toRecord(value);
  }

  function toString(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value : null;
  }

  function getProjectId(project: LaboratoryProjectRecord): string {
    return toString(project.id) || "unknown-project";
  }

  function getSourceKind(project: LaboratoryProjectRecord): string {
    return toString(toProjectSourceRecord(project.source).kind) || "video";
  }

  async function runEditPipeline(
    api: unknown,
    runtime: LaboratoryMediaEditPipelineRuntime,
    requestId: string,
    mode: LaboratoryEditPipelineMode
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    requirePreparedSource(project);
    ensureEditToolReady(runtime);
    await ensureProjectDirectories(runtime, project, requestId);
    const projectId = getProjectId(project);
    const action = mode === "preview" ? "edit-preview" : "edit-apply";
    ensureEditJobSlotAvailable(runtime, projectId, action);
    const jobId = `room-edit-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const targetPath = buildEditTargetPath(runtime, project, mode);
    const mimeType = getDerivedMimeType(getSourceKind(project));
    const recipeSignature = getEditRecipeSignature(project);
    const artifactBaseName = (targetPath.split(/[\\/]/).pop() || "artifact").replace(
      /\.[^.]+$/,
      ""
    );

    registerJob(runtime, {
      action: action,
      featureStage: "edit",
      jobId: jobId,
      projectId: projectId,
      requestId: requestId,
      toolId: "ffmpeg",
    });

    pushJobState(api, {
      action: action,
      featureStage: "edit",
      jobId: jobId,
      projectId: projectId,
      requestId: requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    await patchActiveProject(runtime, function (nextProject) {
      const nextEdit = toProjectEditRecord(nextProject.edit);
      nextProject.edit = nextEdit;
      nextEdit.lastError = null;
      nextEdit.lastActionAt = new Date().toISOString();
      if (mode === "preview") {
        nextEdit.preview = {
          ...toPreviewRecord(nextEdit.preview),
          error: null,
          jobId: jobId,
          requestId: requestId,
          status: "generating",
        };
      }
      return nextProject;
    });

    try {
      const runResult = await callRoomTools({
        args: buildEditCommand(runtime, project, targetPath, mode),
        cwd: getProjectEditDir(runtime, project),
        jobId: jobId,
        operation: "tool-run",
        requestId: requestId,
        roomId: roomId,
        timeoutMs: 20 * 60 * 1000,
        toolId: "ffmpeg",
      });
      const runPayload = toRunPayloadRecord(toRecord(runResult)["run"]);
      const exitCode =
        typeof runPayload.exitCode === "number" && Number.isFinite(runPayload.exitCode)
          ? runPayload.exitCode
          : 0;
      const stderr = toString(runPayload.stderr);
      if (runPayload.cancelled === true || exitCode !== 0) {
        throw new Error(stderr || "FFmpeg edit job failed.");
      }

      const targetFileName = targetPath.split(/[\\/]/).pop() || null;
      const metadataResult = await collectDerivedOutputMetadata(runtime, project, {
        jobId: jobId,
        mimeType: mimeType,
        path: targetPath,
        requestId: requestId,
      });
      const artifacts = await buildAuxiliaryArtifacts(runtime, project, {
        baseName: artifactBaseName,
        jobId: jobId,
        metadata: metadataResult.metadata,
        mode: mode,
        outputPath: targetPath,
        requestId: requestId,
      });

      const createdAt = new Date().toISOString();
      await patchActiveProject(runtime, function (nextProject) {
        const nextEdit = toProjectEditRecord(nextProject.edit);
        nextProject.edit = nextEdit;
        nextEdit.lastError = null;
        nextEdit.lastActionAt = createdAt;
        nextEdit.dirty = false;

        if (mode === "preview") {
          nextEdit.preview = {
            artifacts: artifacts,
            error: metadataResult.metadataError,
            fileName: targetFileName,
            jobId: jobId,
            metadata: metadataResult.metadata,
            mimeType: mimeType,
            outputId: "preview",
            path: targetPath,
            recipeSignature: recipeSignature,
            requestId: requestId,
            status: "ready",
            updatedAt: createdAt,
          };
          return nextProject;
        }

        const outputId = `edit-output-${Date.now()}`;
        const nextOutput = toEditOutputRecord(
          normalizeEditOutput({
            artifacts: artifacts,
            createdAt: createdAt,
            fileName: targetFileName,
            id: outputId,
            jobId: jobId,
            kind: getSourceKind(project),
            label: buildEditOutputLabel(project, mode),
            metadata: metadataResult.metadata,
            mimeType: mimeType,
            path: targetPath,
            recipeSignature: recipeSignature,
            sourcePath: getPreparedSourcePath(project),
          })
        );
        const existingOutputs = Array.isArray(nextEdit.outputs) ? nextEdit.outputs : [];
        nextEdit.outputs = [nextOutput].concat(existingOutputs);
        nextEdit.activeOutputId = toString(nextOutput.id);
        nextEdit.handoffMode = "derived";
        markProfileAsStale(nextProject, "Edit output changed; rerun the profile preflight.");
        markCloseoutAsStale(nextProject, "Edit output changed; rerun downstream processing.", [
          audioFeatureId,
        ]);
        const previousPreview = toPreviewRecord(nextEdit.preview);
        nextEdit.preview = {
          ...previousPreview,
          status:
            toString(previousPreview.path) !== null
              ? toString(previousPreview.recipeSignature) === recipeSignature
                ? "ready"
                : "stale"
              : "idle",
        };
        return nextProject;
      });

      pushJobState(api, {
        action: action,
        featureStage: "edit",
        jobId: jobId,
        percent: 100,
        projectId: projectId,
        requestId: requestId,
        stage: "completed",
        toolId: "ffmpeg",
      });

      return {
        fileName: targetFileName,
        metadata: metadataResult.metadata,
        path: targetPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await patchActiveProject(runtime, function (nextProject) {
        const nextEdit = toProjectEditRecord(nextProject.edit);
        nextProject.edit = nextEdit;
        nextEdit.lastError = errorMessage;
        nextEdit.lastActionAt = new Date().toISOString();
        if (mode === "preview") {
          nextEdit.preview = {
            ...toPreviewRecord(nextEdit.preview),
            error: errorMessage,
            status: "error",
          };
        }
        return nextProject;
      });

      pushJobState(api, {
        action: action,
        featureStage: "edit",
        jobId: jobId,
        message: errorMessage,
        projectId: projectId,
        requestId: requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  return {
    runEditPipeline,
  };
}
