type LaboratoryRecord = Record<string, unknown>;

type LaboratoryDirectoryEntry = {
  isDirectory: boolean;
  name: string;
  path: string;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  id?: unknown;
  updatedAt?: unknown;
};

type LaboratoryRuntimePaths = LaboratoryRecord & {
  projectsDir?: unknown;
  toolStatePath?: unknown;
};

type LaboratoryToolEntry = LaboratoryRecord & {
  companionPaths?: unknown;
  toolId?: unknown;
};

type LaboratoryToolState = {
  schemaVersion: number;
  tools: Record<string, LaboratoryToolEntry>;
  updatedAt: string | number | null;
};

type LaboratoryProfileModelEntry = LaboratoryRecord & {
  modelId?: unknown;
};

type LaboratoryProfileModelCatalog = LaboratoryRecord & {
  models?: unknown;
};

type LaboratoryProfileModelState = {
  activeLanguage: string | null;
  activeModelId: string | null;
  activeVariant: string | null;
  models: Record<string, LaboratoryProfileModelEntry>;
  runtimeStatus?: unknown;
  schemaVersion: number;
  updatedAt: string | number | null;
};

type LaboratoryProjectStorageRuntime = {
  activeProjectId: string | null;
  editPresets: unknown;
  paths: LaboratoryRuntimePaths;
  profileCapabilities: unknown;
  profileModelState: LaboratoryProfileModelState;
  profileModels: LaboratoryProfileModelCatalog;
  profilePresets: unknown;
  projects: LaboratoryProjectRecord[];
  sourcePresets: unknown;
  toolState: LaboratoryToolState;
};

type LaboratoryProjectStorageRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  buildEditManifest: (project: LaboratoryProjectRecord) => unknown;
  buildProcessManifest: (project: LaboratoryProjectRecord) => unknown;
  buildProfileManifest: (project: LaboratoryProjectRecord) => unknown;
  buildReportManifest: (project: LaboratoryProjectRecord) => unknown;
  createDefaultProfileModelEntry: (modelId: string) => LaboratoryProfileModelEntry;
  createDefaultToolEntry: (toolId: string) => LaboratoryToolEntry;
  createDefaultToolState: (toolIds: unknown) => LaboratoryToolState;
  getProjectEditManifestPath: (
    runtime: LaboratoryProjectStorageRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getProjectMetaPath: (
    runtime: LaboratoryProjectStorageRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getProjectProcessManifestPath: (
    runtime: LaboratoryProjectStorageRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getProjectProfileManifestPath: (
    runtime: LaboratoryProjectStorageRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getProjectReportManifestPath: (
    runtime: LaboratoryProjectStorageRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getRuntimeToolIds: (runtime: LaboratoryProjectStorageRuntime) => string[];
  listDirectory: (dirPath: string) => Promise<LaboratoryDirectoryEntry[]>;
  normalizeProject: (
    rawValue: unknown,
    sourcePresets: unknown,
    editPresets: unknown,
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    runtime: LaboratoryProjectStorageRuntime
  ) => LaboratoryProjectRecord;
  readJsonFile: (filePath: string) => Promise<unknown>;
  syncProjectFeatureProjections: (
    runtime: LaboratoryProjectStorageRuntime,
    project: LaboratoryProjectRecord
  ) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
  writeJsonFile: (filePath: string, payload: unknown) => Promise<unknown> | unknown;
};

export function createLaboratoryProjectStorageRuntime(deps: LaboratoryProjectStorageRuntimeDeps) {
  const {
    asNonEmptyString,
    buildEditManifest,
    buildProcessManifest,
    buildProfileManifest,
    buildReportManifest,
    createDefaultProfileModelEntry,
    createDefaultToolEntry,
    createDefaultToolState,
    getProjectEditManifestPath,
    getProjectMetaPath,
    getProjectProcessManifestPath,
    getProjectProfileManifestPath,
    getProjectReportManifestPath,
    getRuntimeToolIds,
    listDirectory,
    normalizeProject,
    readJsonFile,
    syncProjectFeatureProjections,
    toRecord,
    writeJsonFile,
  } = deps;

  function toRuntimePaths(value: unknown): LaboratoryRuntimePaths {
    return toRecord(value);
  }

  function toToolEntry(value: unknown): LaboratoryToolEntry {
    return toRecord(value);
  }

  function toProfileModelCatalog(value: unknown): LaboratoryProfileModelCatalog {
    return toRecord(value);
  }

  function sortProjects(entries: LaboratoryProjectRecord[]): LaboratoryProjectRecord[] {
    return entries.sort(function (left, right) {
      return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    });
  }

  async function loadProjects(runtime: LaboratoryProjectStorageRuntime) {
    const projectsDir = asNonEmptyString(toRuntimePaths(runtime.paths).projectsDir);
    if (projectsDir === null) {
      runtime.projects = [];
      return;
    }

    const entries = await listDirectory(projectsDir);
    const projects: LaboratoryProjectRecord[] = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry || entry.isDirectory !== true) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop -- NOTE: keep project bootstrap reads sequential to cap disk IO.
      const project = await readJsonFile(`${entry.path}/project.json`);
      if (project) {
        const normalizedProject = normalizeProject(
          project,
          runtime.sourcePresets,
          runtime.editPresets,
          runtime.profilePresets,
          runtime.profileModels,
          runtime.profileCapabilities,
          runtime
        );
        syncProjectFeatureProjections(runtime, normalizedProject);
        projects.push(normalizedProject);
      }
    }

    runtime.projects = sortProjects(projects);
  }

  async function saveProject(
    runtime: LaboratoryProjectStorageRuntime,
    project: LaboratoryProjectRecord
  ) {
    await writeJsonFile(getProjectMetaPath(runtime, project), project);
    await writeJsonFile(getProjectEditManifestPath(runtime, project), buildEditManifest(project));
    await writeJsonFile(
      getProjectProfileManifestPath(runtime, project),
      buildProfileManifest(project)
    );
    await writeJsonFile(
      getProjectProcessManifestPath(runtime, project),
      buildProcessManifest(project)
    );
    await writeJsonFile(
      getProjectReportManifestPath(runtime, project),
      buildReportManifest(project)
    );
  }

  async function persistToolState(runtime: LaboratoryProjectStorageRuntime) {
    const toolStatePath = asNonEmptyString(toRuntimePaths(runtime.paths).toolStatePath);
    if (toolStatePath === null) {
      return;
    }

    runtime.toolState.updatedAt = new Date().toISOString();
    await writeJsonFile(toolStatePath, runtime.toolState);
  }

  async function persistProfileModelState(runtime: LaboratoryProjectStorageRuntime) {
    runtime.profileModelState.updatedAt = new Date().toISOString();
  }

  async function loadToolState(runtime: LaboratoryProjectStorageRuntime) {
    const toolStatePath = asNonEmptyString(toRuntimePaths(runtime.paths).toolStatePath);
    const stored = toolStatePath ? await readJsonFile(toolStatePath) : null;
    const storedRecord = toRecord(stored);
    const tools = toRecord(storedRecord["tools"]);
    const nextState = createDefaultToolState(getRuntimeToolIds(runtime));

    getRuntimeToolIds(runtime).forEach(function (toolId) {
      const storedTool = toToolEntry(tools[toolId]);
      nextState.tools[toolId] = {
        ...createDefaultToolEntry(toolId),
        ...storedTool,
        toolId,
        companionPaths: toRecord(storedTool.companionPaths),
      };
    });

    nextState.updatedAt = asNonEmptyString(storedRecord["updatedAt"]);
    runtime.toolState = nextState;
  }

  async function loadProfileModelState(runtime: LaboratoryProjectStorageRuntime) {
    const catalogModels = toRecord(toProfileModelCatalog(runtime.profileModels).models);
    const nextState: LaboratoryProfileModelState = {
      activeLanguage: null,
      activeModelId: null,
      activeVariant: null,
      schemaVersion: 1,
      updatedAt: null,
      models: {},
    };

    Object.keys(catalogModels).forEach(function (modelId) {
      nextState.models[modelId] = {
        ...createDefaultProfileModelEntry(modelId),
        modelId,
      };
    });

    runtime.profileModelState = nextState;
  }

  return {
    loadProfileModelState,
    loadProjects,
    loadToolState,
    persistProfileModelState,
    persistToolState,
    saveProject,
  };
}
