import { createLaboratoryProjectConfigLoader } from "./project-config-loader.js";
import { createLaboratoryProjectStorageRuntime } from "./project-storage.js";
import { createLaboratoryProjectToolStatusRuntime } from "./project-tool-status.js";

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryProjectConfigLoaderDeps = Parameters<typeof createLaboratoryProjectConfigLoader>[0];
type LaboratoryProjectConfigRuntime = Parameters<
  ReturnType<typeof createLaboratoryProjectConfigLoader>["loadRuntimeConfigs"]
>[1];
type LaboratoryProjectStorageRuntimeDeps = Parameters<
  typeof createLaboratoryProjectStorageRuntime
>[0];
type LaboratoryProjectToolStatusRuntimeDeps = Parameters<
  typeof createLaboratoryProjectToolStatusRuntime
>[0];
type LaboratoryProjectStorageRuntime = Parameters<
  ReturnType<typeof createLaboratoryProjectStorageRuntime>["saveProject"]
>[0];
type LaboratoryToolStatusRuntime = Parameters<
  ReturnType<typeof createLaboratoryProjectToolStatusRuntime>["refreshToolStatus"]
>[0];

type LaboratoryRoomApi = Parameters<
  ReturnType<typeof createLaboratoryProjectConfigLoader>["loadRuntimeConfigs"]
>[0] &
  LaboratoryRecord;

type LaboratoryRuntimePaths = LaboratoryRecord & {
  projectsDir?: unknown;
  toolStatePath?: unknown;
};

type LaboratoryToolEntry = LaboratoryRecord & {
  toolId?: unknown;
};

type LaboratoryToolState = {
  schemaVersion: number;
  tools: Record<string, LaboratoryToolEntry>;
  updatedAt: string | number | null;
};

type LaboratoryProfileModelState = {
  models: Record<string, LaboratoryRecord>;
  schemaVersion: number;
  updatedAt: string | number | null;
};

type LaboratoryProjectSourceDraftsRecord = LaboratoryRecord & {
  youtubeCustom?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  drafts?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  routeLabel?: unknown;
  sourceUrl?: unknown;
  status?: unknown;
  storedFileName?: unknown;
  storedPath?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  assets?: unknown;
  id?: unknown;
  source?: unknown;
  updatedAt?: unknown;
};

type LaboratoryResolvePathsResult = LaboratoryRecord & {
  paths?: unknown;
};

type LaboratoryBootstrapStepState = {
  id: string;
  status: "pending" | "active" | "done" | "error";
};

type LaboratoryBootstrapState = {
  active: boolean;
  currentStep: number;
  currentStepId: string | null;
  error: string | null;
  message: string | null;
  status: "idle" | "running" | "ready" | "error";
  steps: LaboratoryBootstrapStepState[];
  totalSteps: number;
};

type LaboratoryProjectLifecycleRuntime = LaboratoryProjectConfigRuntime & {
  activeProjectId: string | null;
  bootstrap: LaboratoryBootstrapState;
  hydrated: boolean;
  hydrating: Promise<void> | null;
  paths: LaboratoryRuntimePaths | null;
  profileModelState: LaboratoryProfileModelState;
  projects: LaboratoryProjectRecord[];
  toolState: LaboratoryToolState;
};

type LaboratoryProjectLifecycleRuntimeDeps = LaboratoryProjectConfigLoaderDeps &
  LaboratoryProjectStorageRuntimeDeps &
  LaboratoryProjectToolStatusRuntimeDeps & {
    cancelJobsForProject: (
      runtime: LaboratoryProjectLifecycleRuntime,
      projectId: string | null,
      requestId: string | null
    ) => Promise<unknown>;
    clone: <T>(value: T) => T;
    createProjectRecord: (
      sourcePresets: unknown,
      editPresets: unknown,
      profilePresets: unknown,
      profileModels: unknown,
      profileCapabilities: unknown,
      featureId: string | null
    ) => LaboratoryProjectRecord;
    defaultFeatureId: string;
    ensureProjectDirectories: (
      runtime: LaboratoryProjectLifecycleRuntime,
      project: LaboratoryProjectRecord,
      requestId: string | null
    ) => Promise<unknown>;
    findProject: (
      runtime: LaboratoryProjectLifecycleRuntime,
      projectId: string | null
    ) => LaboratoryProjectRecord | null;
    getActiveProject: (
      runtime: LaboratoryProjectLifecycleRuntime
    ) => LaboratoryProjectRecord | null;
    getFeatureIdFromContext: (payload: unknown) => string;
    getProjectDir: (
      runtime: LaboratoryProjectLifecycleRuntime,
      project: LaboratoryProjectRecord
    ) => string;
    loadContext: (api: LaboratoryRoomApi) => LaboratoryRecord;
    pushBootstrapState: (
      api: LaboratoryRoomApi,
      runtime: LaboratoryProjectLifecycleRuntime,
      requestId: string | null | undefined,
      action: unknown
    ) => void;
    refreshProfileModelState: (runtime: LaboratoryProjectLifecycleRuntime) => Promise<unknown>;
    roomId: string;
    syncProjectFeatureProjections: (
      runtime: LaboratoryProjectLifecycleRuntime,
      project: LaboratoryProjectRecord
    ) => void;
    updateProjectTimestamps: (project: LaboratoryProjectRecord) => void;
  };

export function createLaboratoryProjectLifecycleRuntime(
  deps: LaboratoryProjectLifecycleRuntimeDeps
) {
  const {
    asNonEmptyString,
    callRoomTools,
    cancelJobsForProject,
    clone,
    createProjectRecord,
    defaultFeatureId,
    ensureProjectDirectories,
    findProject,
    getActiveProject,
    getFeatureIdFromContext,
    getProjectDir,
    loadContext,
    pushBootstrapState,
    refreshProfileModelState,
    roomId,
    syncProjectFeatureProjections,
    toRecord,
    updateProjectTimestamps,
  } = deps;

  const projectPatchQueues = new WeakMap<LaboratoryProjectLifecycleRuntime, Promise<unknown>>();

  const { loadRuntimeConfigs } = createLaboratoryProjectConfigLoader({
    readJsonFile: deps.readJsonFile,
  });

  const {
    loadProfileModelState,
    loadProjects,
    loadToolState,
    persistProfileModelState,
    persistToolState,
    saveProject,
  } = createLaboratoryProjectStorageRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    buildEditManifest: deps.buildEditManifest,
    buildProcessManifest: deps.buildProcessManifest,
    buildProfileManifest: deps.buildProfileManifest,
    buildReportManifest: deps.buildReportManifest,
    createDefaultProfileModelEntry: deps.createDefaultProfileModelEntry,
    createDefaultToolEntry: deps.createDefaultToolEntry,
    createDefaultToolState: deps.createDefaultToolState,
    getProjectEditManifestPath: deps.getProjectEditManifestPath,
    getProjectMetaPath: deps.getProjectMetaPath,
    getProjectProcessManifestPath: deps.getProjectProcessManifestPath,
    getProjectProfileManifestPath: deps.getProjectProfileManifestPath,
    getProjectReportManifestPath: deps.getProjectReportManifestPath,
    getRuntimeToolIds: deps.getRuntimeToolIds,
    listDirectory: deps.listDirectory,
    normalizeProject: deps.normalizeProject,
    readJsonFile: deps.readJsonFile,
    syncProjectFeatureProjections,
    toRecord: deps.toRecord,
    writeJsonFile: deps.writeJsonFile,
  });

  const { refreshToolStatus } = createLaboratoryProjectToolStatusRuntime({
    callRoomTools,
    createDefaultToolEntry: deps.createDefaultToolEntry,
    getRuntimeToolIds: deps.getRuntimeToolIds,
    persistToolState: async function (runtime) {
      await persistToolState(runtime as unknown as LaboratoryProjectStorageRuntime);
    },
    roomId,
    toRecord: deps.toRecord,
  });

  function toProjectRecord(value: unknown): LaboratoryProjectRecord {
    return toRecord(value);
  }

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toSourceDraftsRecord(value: unknown): LaboratoryProjectSourceDraftsRecord {
    return toRecord(value);
  }

  function toPathsRecord(value: unknown): LaboratoryRuntimePaths {
    return toRecord(value);
  }

  function requireProjectStorageRuntime(
    runtime: LaboratoryProjectLifecycleRuntime
  ): LaboratoryProjectStorageRuntime {
    if (runtime.paths === null) {
      throw new Error("Project runtime paths are not initialized.");
    }
    return runtime as unknown as LaboratoryProjectStorageRuntime;
  }

  function asToolStatusRuntime(
    runtime: LaboratoryProjectLifecycleRuntime
  ): LaboratoryToolStatusRuntime {
    return runtime as unknown as LaboratoryToolStatusRuntime;
  }

  const bootstrapStepIds = [
    "resolve-paths",
    "load-config",
    "load-tool-state",
    "load-transcript-runtime-state",
    "load-projects",
    "ensure-project",
    "refresh-tools",
    "refresh-transcript-runtime",
  ] as const;
  type LaboratoryBootstrapStepId = (typeof bootstrapStepIds)[number];

  function createBootstrapState(
    status: LaboratoryBootstrapState["status"],
    currentStepId: LaboratoryBootstrapStepId | null,
    message: string | null,
    error: string | null = null
  ): LaboratoryBootstrapState {
    const activeIndex = currentStepId === null ? -1 : bootstrapStepIds.indexOf(currentStepId);
    return {
      active: status === "running",
      currentStep:
        activeIndex >= 0 ? activeIndex + 1 : status === "ready" ? bootstrapStepIds.length : 0,
      currentStepId,
      error,
      message,
      status,
      steps: bootstrapStepIds.map(function (stepId, index): LaboratoryBootstrapStepState {
        if (status === "ready") {
          return {
            id: stepId,
            status: "done",
          };
        }
        if (status === "error" && stepId === currentStepId) {
          return {
            id: stepId,
            status: "error",
          };
        }
        if (activeIndex >= 0 && index < activeIndex) {
          return {
            id: stepId,
            status: "done",
          };
        }
        if (stepId === currentStepId) {
          return {
            id: stepId,
            status: status === "running" ? "active" : "pending",
          };
        }
        return {
          id: stepId,
          status: "pending",
        };
      }),
      totalSteps: bootstrapStepIds.length,
    };
  }

  function pushBootstrapProgress(
    api: LaboratoryRoomApi,
    runtime: LaboratoryProjectLifecycleRuntime,
    status: LaboratoryBootstrapState["status"],
    currentStepId: LaboratoryBootstrapStepId | null,
    message: string | null,
    error: string | null = null
  ) {
    runtime.bootstrap = createBootstrapState(status, currentStepId, message, error);
    pushBootstrapState(api, runtime, null, null);
  }

  function sortProjects(projects: LaboratoryProjectRecord[]): LaboratoryProjectRecord[] {
    return projects.sort(function (left, right) {
      return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    });
  }

  function isProjectSourceEmpty(project: LaboratoryProjectRecord): boolean {
    const source = toProjectSourceRecord(project.source);
    if (asNonEmptyString(source.status) === "ready") {
      return false;
    }

    return (
      asNonEmptyString(source.storedPath) === null &&
      asNonEmptyString(source.storedFileName) === null &&
      asNonEmptyString(source.sourceUrl) === null &&
      asNonEmptyString(source.routeLabel) === null &&
      asNonEmptyString(source.mimeType) === null &&
      Object.keys(toRecord(source.metadata)).length === 0
    );
  }

  function isEmptyProjectDraft(project: LaboratoryProjectRecord): boolean {
    return (
      isProjectSourceEmpty(project) &&
      (!Array.isArray(project.assets) || project.assets.length === 0)
    );
  }

  async function pruneEmptyDraftProjects(runtime: LaboratoryProjectLifecycleRuntime) {
    const draftProjects = runtime.projects.filter(isEmptyProjectDraft);
    if (draftProjects.length === 0) {
      return;
    }

    const draftIds = new Set(
      draftProjects
        .map(function (project) {
          return asNonEmptyString(project.id);
        })
        .filter((projectId): projectId is string => projectId !== null)
    );

    for (let index = 0; index < draftProjects.length; index += 1) {
      const project = draftProjects[index];
      if (!project) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- NOTE: delete project directories one by one so partial cleanup remains traceable.
      await callRoomTools({
        operation: "delete-path",
        roomId,
        requestId: null,
        targetPath: getProjectDir(runtime, project),
        recursive: true,
      });
    }

    runtime.projects = runtime.projects.filter(function (project) {
      return !draftIds.has(String(project.id || ""));
    });
    if (draftIds.has(String(runtime.activeProjectId || ""))) {
      runtime.activeProjectId = null;
    }
  }

  async function ensureProjectExists(
    runtime: LaboratoryProjectLifecycleRuntime,
    featureId: string | null,
    options?: {
      preferFreshProject?: boolean;
    }
  ) {
    const resolvedFeatureId = featureId || defaultFeatureId;
    if (runtime.projects.length > 0) {
      if (options?.preferFreshProject === true) {
        const latestProject = runtime.projects[0];
        if (latestProject && isProjectSourceEmpty(latestProject)) {
          runtime.activeProjectId = String(latestProject.id || "");
          return;
        }
        const project = await createProject(runtime, resolvedFeatureId);
        runtime.projects = sortProjects(runtime.projects);
        runtime.activeProjectId = String(project.id || "");
        return;
      }
      if (!findProject(runtime, runtime.activeProjectId)) {
        const firstProject = runtime.projects[0];
        runtime.activeProjectId = firstProject ? String(firstProject.id || "") : null;
      }
      return;
    }

    const project = createProjectRecord(
      runtime.sourcePresets,
      runtime.editPresets,
      runtime.profilePresets,
      runtime.profileModels,
      runtime.profileCapabilities,
      resolvedFeatureId
    );
    syncProjectFeatureProjections(runtime, project);
    await ensureProjectDirectories(runtime, project, null);
    await saveProject(requireProjectStorageRuntime(runtime), project);
    runtime.projects = [project];
    runtime.activeProjectId = String(project.id || "");
  }

  async function ensureHydrated(
    api: LaboratoryRoomApi,
    runtime: LaboratoryProjectLifecycleRuntime
  ) {
    if (runtime.hydrated === true) {
      return;
    }

    if (runtime.hydrating) {
      await runtime.hydrating;
      return;
    }

    runtime.hydrating = (async function () {
      try {
        pushBootstrapProgress(api, runtime, "running", "resolve-paths", "resolve-paths");
        const pathResult = (await callRoomTools({
          operation: "resolve-paths",
          roomId,
        })) as LaboratoryResolvePathsResult;

        runtime.paths = toPathsRecord(pathResult.paths);

        pushBootstrapProgress(api, runtime, "running", "load-config", "load-config");
        await loadRuntimeConfigs(api, runtime);

        pushBootstrapProgress(api, runtime, "running", "load-tool-state", "load-tool-state");
        await loadToolState(requireProjectStorageRuntime(runtime));

        pushBootstrapProgress(
          api,
          runtime,
          "running",
          "load-transcript-runtime-state",
          "load-transcript-runtime-state"
        );
        await loadProfileModelState(requireProjectStorageRuntime(runtime));

        pushBootstrapProgress(api, runtime, "running", "load-projects", "load-projects");
        await loadProjects(requireProjectStorageRuntime(runtime));

        pushBootstrapProgress(api, runtime, "running", "ensure-project", "ensure-project");
        await ensureProjectExists(runtime, getFeatureIdFromContext(loadContext(api)), {
          preferFreshProject: true,
        });

        pushBootstrapProgress(api, runtime, "running", "refresh-tools", "refresh-tools");
        await refreshToolStatus(asToolStatusRuntime(runtime));

        pushBootstrapProgress(
          api,
          runtime,
          "running",
          "refresh-transcript-runtime",
          "refresh-transcript-runtime"
        );
        await refreshProfileModelState(runtime);

        runtime.hydrated = true;
        pushBootstrapProgress(api, runtime, "ready", null, "ready");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushBootstrapProgress(
          api,
          runtime,
          "error",
          runtime.bootstrap.currentStepId as LaboratoryBootstrapStepId | null,
          "error",
          message
        );
        throw error;
      }
    })();

    try {
      await runtime.hydrating;
    } finally {
      runtime.hydrating = null;
    }
  }

  function updateProjectInMemory(
    runtime: LaboratoryProjectLifecycleRuntime,
    nextProject: LaboratoryProjectRecord
  ) {
    runtime.projects = sortProjects(
      runtime.projects.map(function (project) {
        return String(project.id || "") === String(nextProject.id || "") ? nextProject : project;
      })
    );
  }

  async function queueProjectPatch<T>(
    runtime: LaboratoryProjectLifecycleRuntime,
    patcher: () => Promise<T>
  ): Promise<T> {
    const previousPatch = projectPatchQueues.get(runtime) || Promise.resolve();
    const nextPatch = previousPatch
      .catch(function () {
        return undefined;
      })
      .then(patcher);
    projectPatchQueues.set(runtime, nextPatch);
    try {
      return await nextPatch;
    } finally {
      if (projectPatchQueues.get(runtime) === nextPatch) {
        projectPatchQueues.delete(runtime);
      }
    }
  }

  async function patchActiveProject(
    runtime: LaboratoryProjectLifecycleRuntime,
    updater: (project: LaboratoryProjectRecord) => LaboratoryProjectRecord
  ) {
    return queueProjectPatch(runtime, async function () {
      const activeProject = getActiveProject(runtime);
      if (activeProject === null) {
        throw new Error("Active project is missing.");
      }

      const projectStorageRuntime = requireProjectStorageRuntime(runtime);
      const nextProject = deps.normalizeProject(
        updater(clone(activeProject)),
        runtime.sourcePresets,
        runtime.editPresets,
        runtime.profilePresets,
        runtime.profileModels,
        runtime.profileCapabilities,
        projectStorageRuntime
      );
      syncProjectFeatureProjections(runtime, nextProject);
      updateProjectTimestamps(nextProject);
      await saveProject(projectStorageRuntime, nextProject);
      updateProjectInMemory(runtime, nextProject);
      runtime.activeProjectId = String(nextProject.id || "");
      return nextProject;
    });
  }

  async function patchActiveProjectDrafts(
    runtime: LaboratoryProjectLifecycleRuntime,
    fields: unknown
  ) {
    const patch = toRecord(fields);
    if (Object.keys(patch).length === 0) {
      return getActiveProject(runtime);
    }

    return patchActiveProject(runtime, function (nextProject) {
      const nextProjectRecord = toProjectRecord(nextProject);
      const source = toProjectSourceRecord(nextProjectRecord.source);
      const drafts = toSourceDraftsRecord(source.drafts);
      source.drafts = {
        ...drafts,
        ...patch,
        ["youtubeCustom"]: {
          ...toRecord(drafts["youtubeCustom"]),
          ...toRecord(patch["youtubeCustom"]),
        },
      };
      nextProjectRecord.source = source;
      return nextProjectRecord;
    });
  }

  async function createProject(
    runtime: LaboratoryProjectLifecycleRuntime,
    featureId: string | null
  ) {
    await pruneEmptyDraftProjects(runtime);
    const project = createProjectRecord(
      runtime.sourcePresets,
      runtime.editPresets,
      runtime.profilePresets,
      runtime.profileModels,
      runtime.profileCapabilities,
      featureId
    );
    syncProjectFeatureProjections(runtime, project);
    await ensureProjectDirectories(runtime, project, null);
    await saveProject(requireProjectStorageRuntime(runtime), project);
    runtime.projects = sortProjects([project, ...runtime.projects]);
    runtime.activeProjectId = String(project.id || "");
    return project;
  }

  async function deleteProject(
    runtime: LaboratoryProjectLifecycleRuntime,
    projectId: string | null,
    requestId: string | null,
    featureId: string | null
  ) {
    const project = findProject(runtime, projectId);
    if (project === null) {
      return null;
    }

    await cancelJobsForProject(runtime, projectId, requestId);
    await callRoomTools({
      operation: "delete-path",
      roomId,
      requestId,
      targetPath: getProjectDir(runtime, project),
      recursive: true,
    });
    runtime.projects = runtime.projects.filter(function (entry) {
      return String(entry.id || "") !== String(projectId || "");
    });
    if (runtime.activeProjectId === projectId) {
      runtime.activeProjectId = runtime.projects[0] ? String(runtime.projects[0].id || "") : null;
    }
    await ensureProjectExists(runtime, featureId);
    return project;
  }

  return {
    createProject,
    deleteProject,
    ensureHydrated,
    ensureProjectExists,
    loadProfileModelState,
    loadProjects,
    loadRuntimeConfigs,
    loadToolState,
    patchActiveProject,
    patchActiveProjectDrafts,
    persistProfileModelState,
    persistToolState,
    refreshToolStatus,
    saveProject,
    updateProjectInMemory,
  };
}
