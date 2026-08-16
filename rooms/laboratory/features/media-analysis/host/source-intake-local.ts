import { resetLaboratoryWorkbenchForSourceActivation } from "../../../shared/host/runtime-primitives.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryMediaLocalRuntime = LaboratoryRecord & {
  sourcePresets?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  drafts?: unknown;
  kind?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  source: LaboratoryProjectSourceRecord;
  workbench?: unknown;
};

type LaboratorySourceConfigRecord = LaboratoryRecord & {
  fileDialogFilters?: unknown;
};

type LaboratoryPreparedSource = {
  metadata: unknown;
  metadataError: string | null;
  mimeType: string | null;
  storedFileName: string | null;
  storedPath: string | null;
};

type LaboratoryOpenDialogResult = LaboratoryRecord & {
  canceled?: unknown;
  filePaths?: unknown;
};

type LaboratoryCopyFileResult = LaboratoryRecord & {
  error?: unknown;
  message?: unknown;
  name?: unknown;
  path?: unknown;
  success?: unknown;
};

type LaboratoryElectronApi = {
  copyFileTo: (sourcePath: string, destinationDir: string) => Promise<LaboratoryCopyFileResult>;
  showOpenDialog: (options: LaboratoryRecord) => Promise<LaboratoryOpenDialogResult>;
};

type MediaLocalSourceIntakeRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  getActiveProject: (runtime: LaboratoryMediaLocalRuntime) => LaboratoryProjectRecord;
  getElectronApi: () => LaboratoryElectronApi | null;
  getProjectSourceDir: (
    runtime: LaboratoryMediaLocalRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getSourceConfig: (sourcePresets: unknown, sourceKind: unknown) => LaboratorySourceConfigRecord;
  normalizeMimeType: (fileName: unknown, kind: string) => string;
  patchActiveProject: (
    runtime: LaboratoryMediaLocalRuntime,
    updater: (project: LaboratoryProjectRecord) => LaboratoryProjectRecord
  ) => Promise<unknown>;
  resetEditForCurrentSource: (
    runtime: LaboratoryMediaLocalRuntime,
    project: LaboratoryProjectRecord
  ) => void;
  resetProfileForCurrentSource: (
    runtime: LaboratoryMediaLocalRuntime,
    project: LaboratoryProjectRecord,
    reason: string
  ) => void;
  resolvePreparedSource: (
    runtime: LaboratoryMediaLocalRuntime,
    project: LaboratoryProjectRecord,
    options: LaboratoryRecord
  ) => Promise<LaboratoryPreparedSource>;
};

export function createMediaLocalSourceIntakeRuntime(deps: MediaLocalSourceIntakeRuntimeDeps) {
  const {
    asNonEmptyString,
    getActiveProject,
    getElectronApi,
    getProjectSourceDir,
    getSourceConfig,
    normalizeMimeType,
    patchActiveProject,
    resetEditForCurrentSource,
    resetProfileForCurrentSource,
    resolvePreparedSource,
  } = deps;

  function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
    );
  }

  function toRecord(value: unknown): LaboratoryRecord {
    if (value !== null && typeof value === "object" && Array.isArray(value) === false) {
      return value as LaboratoryRecord;
    }
    return {};
  }

  function setProjectSource(
    project: LaboratoryProjectRecord,
    updater: (source: LaboratoryProjectSourceRecord) => void
  ) {
    const nextSource = project.source;
    updater(nextSource);
    project.source = nextSource;
  }

  function getProjectSourceKind(project: LaboratoryProjectRecord): string {
    const drafts = toRecord(project.source.drafts);
    const draftKind = asNonEmptyString(drafts["kind"]);
    if (draftKind === "video" || draftKind === "audio" || draftKind === "image") {
      return draftKind;
    }
    return typeof project.source.kind === "string" && project.source.kind.trim() !== ""
      ? project.source.kind
      : "video";
  }

  function normalizeSourceKind(value: unknown): string | null {
    const sourceKind = asNonEmptyString(value);
    return sourceKind === "video" || sourceKind === "audio" || sourceKind === "image"
      ? sourceKind
      : null;
  }

  function isAutoSourceKind(value: unknown): boolean {
    return asNonEmptyString(value) === "auto";
  }

  function getRequestedSourceKind(project: LaboratoryProjectRecord, localFields: unknown): string {
    const fieldKind = normalizeSourceKind(toRecord(localFields)["kind"]);
    return fieldKind || getProjectSourceKind(project);
  }

  function getFileDialogFilters(
    runtime: LaboratoryMediaLocalRuntime,
    localFields: unknown,
    fallbackKind: string
  ) {
    if (isAutoSourceKind(toRecord(localFields)["kind"]) !== true) {
      const sourceConfig = getSourceConfig(
        runtime.sourcePresets,
        normalizeSourceKind(toRecord(localFields)["kind"]) || fallbackKind
      );
      return Array.isArray(sourceConfig.fileDialogFilters)
        ? sourceConfig.fileDialogFilters.map(toRecord)
        : [];
    }

    const extensionSet = new Set<string>();
    const filters = (["video", "audio", "image"] as const).flatMap(function (kind) {
      const sourceConfig = getSourceConfig(runtime.sourcePresets, kind);
      return Array.isArray(sourceConfig.fileDialogFilters)
        ? sourceConfig.fileDialogFilters.map(toRecord)
        : [];
    });
    filters.forEach(function (filter) {
      toStringArray(filter["extensions"]).forEach(function (extension) {
        extensionSet.add(extension);
      });
    });
    return [
      {
        name: "Media",
        extensions: Array.from(extensionSet),
      },
      ...filters,
    ];
  }

  function inferSourceKindFromPath(runtime: LaboratoryMediaLocalRuntime, filePath: string) {
    const extension = filePath.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() || "";
    for (const kind of ["video", "audio", "image"] as const) {
      const sourceConfig = getSourceConfig(runtime.sourcePresets, kind);
      const filters = Array.isArray(sourceConfig.fileDialogFilters)
        ? sourceConfig.fileDialogFilters.map(toRecord)
        : [];
      const matches = filters.some(function (filter) {
        return toStringArray(filter["extensions"]).some(
          (candidate) => candidate.toLowerCase() === extension
        );
      });
      if (matches === true) {
        return kind;
      }
    }
    return null;
  }

  async function handleLocalPick(
    _api: unknown,
    runtime: LaboratoryMediaLocalRuntime,
    requestId: string,
    localFields?: unknown
  ) {
    const project = getActiveProject(runtime);
    const requestedSourceKind = getRequestedSourceKind(project, localFields);
    const electronApi = getElectronApi();
    if (electronApi === null || typeof electronApi.showOpenDialog !== "function") {
      throw new Error("File picker is unavailable.");
    }

    const dialogResult = await electronApi.showOpenDialog({
      properties: ["openFile"],
      filters: getFileDialogFilters(runtime, localFields, requestedSourceKind),
    });

    const selectedPath = asNonEmptyString(toStringArray(dialogResult.filePaths)[0]);
    if (dialogResult.canceled === true || selectedPath === null) {
      return { cancelled: true };
    }
    const sourceKind =
      isAutoSourceKind(toRecord(localFields)["kind"]) === true
        ? inferSourceKindFromPath(runtime, selectedPath) || requestedSourceKind
        : requestedSourceKind;
    const preparedProject = {
      ...project,
      source: {
        ...project.source,
        kind: sourceKind,
      },
    };

    const sourceDir = getProjectSourceDir(runtime, project);
    const copyResult = await electronApi.copyFileTo(selectedPath, sourceDir);
    if (copyResult.success !== true) {
      throw new Error(
        (typeof copyResult.message === "string" && copyResult.message) ||
          (typeof copyResult.error === "string" && copyResult.error) ||
          "Copy failed."
      );
    }

    const storedPath = asNonEmptyString(copyResult.path);
    const storedFileName =
      asNonEmptyString(copyResult.name) || (storedPath ? storedPath.split(/[\\/]/).pop() : null);
    const preparedSource = await resolvePreparedSource(runtime, preparedProject, {
      requestId: requestId,
      storedPath: storedPath,
      storedFileName: storedFileName,
      mimeType: normalizeMimeType(storedFileName, sourceKind),
    });

    await patchActiveProject(runtime, function (nextProject) {
      setProjectSource(nextProject, function (nextSource) {
        nextSource["mode"] = "local";
        nextSource["kind"] = sourceKind;
        nextSource["status"] = "ready";
        nextSource["storedPath"] = preparedSource.storedPath;
        nextSource["storedFileName"] = preparedSource.storedFileName;
        nextSource["mimeType"] = preparedSource.mimeType;
        nextSource["sourceUrl"] = selectedPath;
        nextSource["routeLabel"] = "Local copy";
        nextSource["lastError"] = null;
        nextSource["metadata"] = preparedSource.metadata;
        nextSource["metadataError"] = preparedSource.metadataError;
      });
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

    return {
      storedPath: preparedSource.storedPath,
      storedFileName: preparedSource.storedFileName,
    };
  }

  return {
    handleLocalPick,
  };
}
