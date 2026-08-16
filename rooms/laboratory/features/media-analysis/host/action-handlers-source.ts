import { resetLaboratoryWorkbenchForSourceActivation } from "../../../shared/host/runtime-primitives.js";
import { inferLabSourceKindFromUrl } from "../../../shared/lab-asset-kind.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  kind?: unknown;
  lastError?: unknown;
  metadata?: unknown;
  metadataError?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  routeLabel?: unknown;
  sourceUrl?: unknown;
  status?: unknown;
  storedFileName?: unknown;
  storedPath?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  source: LaboratoryProjectSourceRecord;
};

type MediaSourceActionRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  getDefaultMode: (sourcePresets: unknown, sourceKind: unknown) => string;
  getDefaultSourceType: (sourcePresets: unknown) => string;
  handleLocalPick: (
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    localFields?: unknown
  ) => Promise<unknown>;
  handleUrlDownload: (
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string
  ) => Promise<unknown>;
  handleYoutubeDownload: (
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string
  ) => Promise<unknown>;
  handleYoutubeProbe: (
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    url: string
  ) => Promise<unknown>;
  patchActiveProject: (
    runtime: LaboratoryRecord,
    patcher: (project: LaboratoryRecord) => LaboratoryRecord
  ) => Promise<unknown>;
  patchActiveProjectDrafts: (runtime: LaboratoryRecord, fields: unknown) => Promise<unknown>;
  resetEditForCurrentSource: (runtime: LaboratoryRecord, project: LaboratoryRecord) => void;
  resetProfileForCurrentSource: (
    runtime: LaboratoryRecord,
    project: LaboratoryRecord,
    reason: string
  ) => void;
};

function isLaboratoryRecord(value: unknown): value is LaboratoryRecord {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function toRecord(value: unknown): LaboratoryRecord {
  return isLaboratoryRecord(value) ? value : {};
}

function toProjectRecord(value: unknown): LaboratoryProjectRecord {
  const projectRecord = isLaboratoryRecord(value) ? value : {};
  const sourceRecord = isLaboratoryRecord(projectRecord["source"]) ? projectRecord["source"] : {};
  return {
    ...projectRecord,
    source: sourceRecord,
  };
}

export function createMediaSourceActionRuntime(deps: MediaSourceActionRuntimeDeps) {
  const {
    asNonEmptyString,
    getDefaultMode,
    getDefaultSourceType,
    handleLocalPick,
    handleUrlDownload,
    handleYoutubeDownload,
    handleYoutubeProbe,
    patchActiveProject,
    patchActiveProjectDrafts,
    resetEditForCurrentSource,
    resetProfileForCurrentSource,
  } = deps;

  async function setSourceKind(runtime: LaboratoryRecord, actionPayload: LaboratoryRecord) {
    return patchActiveProject(runtime, function (project) {
      const nextProject = toProjectRecord(project);
      nextProject.source.kind =
        asNonEmptyString(actionPayload["kind"]) || getDefaultSourceType(runtime["sourcePresets"]);
      nextProject.source.mode = getDefaultMode(runtime["sourcePresets"], nextProject.source.kind);
      nextProject.source.status = "idle";
      nextProject.source.storedPath = null;
      nextProject.source.storedFileName = null;
      nextProject.source.sourceUrl = null;
      nextProject.source.mimeType = null;
      nextProject.source.routeLabel = null;
      nextProject.source.lastError = null;
      nextProject.source.metadata = null;
      nextProject.source.metadataError = null;
      nextProject["workbench"] = resetLaboratoryWorkbenchForSourceActivation(
        nextProject["workbench"]
      );
      resetEditForCurrentSource(runtime, nextProject);
      resetProfileForCurrentSource(
        runtime,
        nextProject,
        "Source type changed; rerun the profile preflight."
      );
      return nextProject;
    });
  }

  async function setSourceMode(runtime: LaboratoryRecord, actionPayload: LaboratoryRecord) {
    return patchActiveProject(runtime, function (project) {
      const nextProject = toProjectRecord(project);
      nextProject.source.mode =
        asNonEmptyString(actionPayload["mode"]) ||
        getDefaultMode(runtime["sourcePresets"], nextProject.source.kind);
      nextProject.source.status = "idle";
      nextProject.source.storedPath = null;
      nextProject.source.storedFileName = null;
      nextProject.source.sourceUrl = null;
      nextProject.source.mimeType = null;
      nextProject.source.routeLabel = null;
      nextProject.source.lastError = null;
      nextProject.source.metadata = null;
      nextProject.source.metadataError = null;
      nextProject["workbench"] = resetLaboratoryWorkbenchForSourceActivation(
        nextProject["workbench"]
      );
      resetEditForCurrentSource(runtime, nextProject);
      resetProfileForCurrentSource(
        runtime,
        nextProject,
        "Source import method changed; rerun the profile preflight."
      );
      return nextProject;
    });
  }

  async function updateDrafts(runtime: LaboratoryRecord, fields: LaboratoryRecord) {
    return patchActiveProjectDrafts(runtime, fields);
  }

  async function pickLocal(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    actionPayload: LaboratoryRecord
  ) {
    await patchActiveProjectDrafts(runtime, actionPayload["fields"]);
    return handleLocalPick(api, runtime, requestId, actionPayload["fields"]);
  }

  async function downloadUrl(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    actionPayload: LaboratoryRecord
  ) {
    await patchActiveProjectDrafts(runtime, actionPayload["fields"]);
    return handleUrlDownload(api, runtime, requestId);
  }

  async function downloadYoutube(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    actionPayload: LaboratoryRecord
  ) {
    await patchActiveProjectDrafts(runtime, actionPayload["fields"]);
    return handleYoutubeDownload(api, runtime, requestId);
  }

  function isYoutubeUrl(value: string) {
    try {
      const parsedUrl = new URL(value);
      const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
      return (
        host === "youtu.be" ||
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "youtube-nocookie.com"
      );
    } catch {
      return false;
    }
  }

  async function checkProjectImportUrl(
    api: unknown,
    runtime: LaboratoryRecord,
    requestId: string,
    actionPayload: LaboratoryRecord
  ) {
    const fields = toRecord(actionPayload["fields"]);
    await patchActiveProjectDrafts(runtime, fields);
    const urlInput = asNonEmptyString(fields["urlInput"]);
    if (urlInput === null) {
      throw new Error("URL is required.");
    }
    if (isYoutubeUrl(urlInput) === true) {
      return handleYoutubeProbe(api, runtime, requestId, urlInput);
    }
    return {
      url: urlInput,
      isYoutube: false,
      kind: inferLabSourceKindFromUrl(urlInput),
    };
  }

  return {
    checkProjectImportUrl,
    downloadUrl,
    downloadYoutube,
    pickLocal,
    setSourceKind,
    setSourceMode,
    updateDrafts,
  };
}
