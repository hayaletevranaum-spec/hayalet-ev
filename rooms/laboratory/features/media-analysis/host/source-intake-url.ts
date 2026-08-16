import { resetLaboratoryWorkbenchForSourceActivation } from "../../../shared/host/runtime-primitives.js";
import { createLabOutputAsset, upsertLabAsset } from "../../../shared/host/lab-assets.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryMediaUrlRuntime = LaboratoryRecord;

type LaboratoryProjectSourceDraftsRecord = LaboratoryRecord & {
  urlInput?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  drafts?: unknown;
  kind?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  id?: unknown;
  source?: unknown;
  workbench?: unknown;
};

type LaboratoryPreparedSource = {
  metadata: unknown;
  metadataError: string | null;
  mimeType: string | null;
  storedFileName: string | null;
  storedPath: string | null;
};

type LaboratoryDownloadedFileRecord = LaboratoryRecord & {
  contentType?: unknown;
  fileName?: unknown;
  path?: unknown;
};

type MediaUrlSourceIntakeRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  callRoomTools: (payload: LaboratoryRecord) => Promise<unknown>;
  cancelJobsForProject: (
    runtime: LaboratoryMediaUrlRuntime,
    projectId: string | null,
    requestId: string
  ) => Promise<unknown>;
  clearJob: (runtime: LaboratoryMediaUrlRuntime, jobId: string) => void;
  deriveFilename: (urlValue: string, sourceKind: unknown) => string;
  getActiveProject: (runtime: LaboratoryMediaUrlRuntime) => LaboratoryProjectRecord | null;
  getProjectSourceDir: (
    runtime: LaboratoryMediaUrlRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  normalizeMimeType: (fileName: unknown, kind: string) => string;
  patchActiveProject: (
    runtime: LaboratoryMediaUrlRuntime,
    updater: (project: LaboratoryProjectRecord) => LaboratoryProjectRecord
  ) => Promise<unknown>;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  registerJob: (runtime: LaboratoryMediaUrlRuntime, payload: LaboratoryRecord) => void;
  resetEditForCurrentSource: (
    runtime: LaboratoryMediaUrlRuntime,
    project: LaboratoryProjectRecord
  ) => void;
  resetProfileForCurrentSource: (
    runtime: LaboratoryMediaUrlRuntime,
    project: LaboratoryProjectRecord,
    reason: string
  ) => void;
  resolvePreparedSource: (
    runtime: LaboratoryMediaUrlRuntime,
    project: LaboratoryProjectRecord,
    options: LaboratoryRecord
  ) => Promise<LaboratoryPreparedSource>;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaUrlSourceIntakeRuntime(deps: MediaUrlSourceIntakeRuntimeDeps) {
  const {
    asNonEmptyString,
    callRoomTools,
    cancelJobsForProject,
    clearJob,
    deriveFilename,
    getActiveProject,
    getProjectSourceDir,
    normalizeMimeType,
    patchActiveProject,
    pushJobState,
    registerJob,
    resetEditForCurrentSource,
    resetProfileForCurrentSource,
    resolvePreparedSource,
    roomId,
    toRecord,
  } = deps;

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toProjectSourceDraftsRecord(value: unknown): LaboratoryProjectSourceDraftsRecord {
    return toRecord(value);
  }

  function toDownloadedFileRecord(value: unknown): LaboratoryDownloadedFileRecord {
    return toRecord(value);
  }

  function getProjectId(project: LaboratoryProjectRecord): string | null {
    return asNonEmptyString(project.id);
  }

  function getProjectSourceKind(project: LaboratoryProjectRecord): string {
    const sourceRecord = toProjectSourceRecord(project.source);
    const drafts = getProjectDrafts(project);
    const draftKind = asNonEmptyString(drafts["kind"]);
    if (draftKind === "video" || draftKind === "audio" || draftKind === "image") {
      return draftKind;
    }
    return typeof sourceRecord.kind === "string" && sourceRecord.kind.trim() !== ""
      ? sourceRecord.kind
      : "video";
  }

  function getProjectDrafts(project: LaboratoryProjectRecord): LaboratoryProjectSourceDraftsRecord {
    return toProjectSourceDraftsRecord(toProjectSourceRecord(project.source).drafts);
  }

  function setProjectSource(
    project: LaboratoryProjectRecord,
    updater: (source: LaboratoryProjectSourceRecord) => void
  ) {
    const nextSource = toProjectSourceRecord(project["source"]);
    updater(nextSource);
    project["source"] = nextSource;
  }

  function getDownloadedSourceAssetType(sourceKind: string) {
    if (sourceKind === "image") {
      return "image" as const;
    }
    if (sourceKind === "audio") {
      return "audio" as const;
    }
    return "clip" as const;
  }

  async function handleUrlDownload(
    api: unknown,
    runtime: LaboratoryMediaUrlRuntime,
    requestId: string
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    const projectId = getProjectId(project);
    const sourceDrafts = getProjectDrafts(project);
    const sourceKind = getProjectSourceKind(project);
    const urlValue = asNonEmptyString(sourceDrafts.urlInput);
    if (urlValue === null) {
      throw new Error("Direct URL is empty.");
    }

    await cancelJobsForProject(runtime, projectId, requestId);

    const fileName = deriveFilename(urlValue, sourceKind);
    const jobId = `room-url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      jobId: jobId,
      requestId: requestId,
      action: "source-download-url",
      projectId: projectId,
      featureStage: "source",
    });

    pushJobState(api, {
      requestId: requestId,
      jobId: jobId,
      action: "source-download-url",
      projectId: projectId,
      percent: 0,
      stage: "queued",
    });

    try {
      const downloadResult = await callRoomTools({
        operation: "download-file",
        roomId: roomId,
        requestId: requestId,
        jobId: jobId,
        url: urlValue,
        destinationPath: `${getProjectSourceDir(runtime, project)}/${fileName}`,
        overwrite: false,
      });

      const downloaded = toDownloadedFileRecord(toRecord(downloadResult)["download"]);
      const storedPath = asNonEmptyString(downloaded.path);
      const storedFileName =
        asNonEmptyString(downloaded.fileName) ||
        (storedPath ? storedPath.split(/[\\/]/).pop() : null);
      const preparedSource = await resolvePreparedSource(runtime, project, {
        requestId: requestId,
        jobId: jobId,
        storedPath: storedPath,
        storedFileName: storedFileName,
        mimeType:
          asNonEmptyString(downloaded.contentType) || normalizeMimeType(storedFileName, sourceKind),
      });

      await patchActiveProject(runtime, function (nextProject) {
        if (nextProject.id !== project.id) {
          return nextProject;
        }
        setProjectSource(nextProject, function (nextSource) {
          nextSource["mode"] = "url";
          nextSource["kind"] = sourceKind;
          nextSource["status"] = "ready";
          nextSource["storedPath"] = preparedSource.storedPath;
          nextSource["storedFileName"] = preparedSource.storedFileName;
          nextSource["sourceUrl"] = urlValue;
          nextSource["mimeType"] = preparedSource.mimeType;
          nextSource["routeLabel"] = "Direct URL";
          nextSource["lastError"] = null;
          nextSource["metadata"] = preparedSource.metadata;
          nextSource["metadataError"] = preparedSource.metadataError;
        });
        nextProject["assets"] = upsertLabAsset(
          nextProject["assets"],
          createLabOutputAsset(nextProject, {
            type: getDownloadedSourceAssetType(sourceKind),
            name: preparedSource.storedFileName,
            localPath: preparedSource.storedPath,
            url: urlValue,
            metadata: {
              ...toRecord(preparedSource.metadata),
              evidenceRole: "source",
              flowKind: "remote-url-import",
              kind: sourceKind,
              mimeType: preparedSource.mimeType,
              remoteSourceUrl: urlValue,
              sourceKind,
            },
          })
        );
        resetEditForCurrentSource(runtime, nextProject);
        resetProfileForCurrentSource(
          runtime,
          nextProject,
          "Source media changed; rerun the profile preflight."
        );
        nextProject["workbench"] = resetLaboratoryWorkbenchForSourceActivation(
          nextProject["workbench"]
        );
        return nextProject;
      });

      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: "source-download-url",
        projectId: projectId,
        message: "Download complete.",
        stage: "completed",
        percent: 100,
      });

      return {
        storedPath: preparedSource.storedPath,
        storedFileName: preparedSource.storedFileName,
      };
    } catch (error) {
      await patchActiveProject(runtime, function (nextProject) {
        if (nextProject.id !== project.id) {
          return nextProject;
        }
        setProjectSource(nextProject, function (nextSource) {
          nextSource["status"] = "error";
          nextSource["lastError"] = error instanceof Error ? error.message : String(error);
        });
        return nextProject;
      });

      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: "source-download-url",
        projectId: projectId,
        stage: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  return {
    handleUrlDownload,
  };
}
