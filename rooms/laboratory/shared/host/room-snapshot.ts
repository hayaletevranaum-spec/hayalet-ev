import { createLaboratoryWorkbenchState } from "./runtime-primitives.js";
import { serializeLabAssetForSnapshot } from "./lab-assets.js";
import type { LabAsset } from "../../domain/lab-types.js";

interface SnapshotRecord extends Record<string, unknown> {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  source?: unknown;
  edit?: unknown;
  profile?: unknown;
  audioAnalysis?: unknown;
  process?: unknown;
  report?: unknown;
  routeLabel?: unknown;
  mode?: unknown;
  kind?: unknown;
  status?: unknown;
  storedPath?: unknown;
  handoffMode?: unknown;
  outputs?: unknown;
  path?: unknown;
  preview?: unknown;
  artifacts?: unknown;
  preflight?: unknown;
  targetAssetMode?: unknown;
  results?: unknown;
  entries?: unknown;
  export?: unknown;
  items?: unknown;
  records?: unknown;
  workbench?: unknown;
  exports?: unknown;
  displayName?: unknown;
  installDirName?: unknown;
  availability?: unknown;
  plannedReason?: unknown;
  commandName?: unknown;
  systemCommand?: unknown;
  executableName?: unknown;
  envVarNames?: unknown;
  installer?: unknown;
  installerType?: unknown;
  installPackages?: unknown;
  estimatedDownloadSize?: unknown;
  estimatedInstalledSize?: unknown;
  supportedPythonVersions?: unknown;
  venvDir?: unknown;
  setupHint?: unknown;
  installStrategy?: unknown;
  usedBy?: unknown;
  testImpact?: unknown;
  readinessImpact?: unknown;
  activeProjectId?: unknown;
  assets?: unknown;
  bootstrap?: unknown;
  hydrated?: unknown;
  projects?: unknown;
  jobs?: unknown;
  sourcePresets?: unknown;
  ytDlpForm?: unknown;
  editPresets?: unknown;
  editCapabilities?: unknown;
  profilePresets?: unknown;
  profileCapabilities?: unknown;
  profileModels?: unknown;
  visualAnalysisCatalog?: unknown;
  visualAnalysisCapabilities?: unknown;
  visualAnalysisProviders?: unknown;
  audioAnalysisCatalog?: unknown;
  audioAnalysisCapabilities?: unknown;
  audioAnalysisPresets?: unknown;
  audioAnalysisProviders?: unknown;
  profileModelState?: unknown;
  toolState?: unknown;
  requestId?: unknown;
  action?: unknown;
  projectId?: unknown;
  toolId?: unknown;
  featureStage?: unknown;
  stage?: unknown;
  percent?: unknown;
  message?: unknown;
}

export function createLaboratoryRoomSnapshotRuntime(deps: Record<string, unknown>) {
  const {
    asNonEmptyString,
    clone,
    defaultFeatureId,
    featureIds,
    mediaStages,
    audioFeatureId,
    getFeatureProcessRecord,
    getFeatureReportRecord,
    getRuntimeToolIds,
    getStageSupport,
    getToolManifest,
    mediaFeatureId,
    normalizeAudioAnalysisModuleResult,
    normalizeAudioAnalysisState,
    roomId,
    syncProjectFeatureProjections,
    toFileUrl,
    toRecord,
  } = deps as {
    asNonEmptyString: (value: unknown) => string | null;
    clone: (value: unknown) => unknown;
    defaultFeatureId: string;
    featureIds: string[];
    mediaStages: string[];
    audioFeatureId: string;
    getFeatureProcessRecord: (project: SnapshotRecord, featureId: string) => SnapshotRecord;
    getFeatureReportRecord: (project: SnapshotRecord, featureId: string) => SnapshotRecord;
    getRuntimeToolIds: (runtime: SnapshotRecord) => string[];
    getStageSupport: (toolManifest: SnapshotRecord, stageId: string) => string;
    getToolManifest: (runtime: SnapshotRecord, toolId: string) => SnapshotRecord;
    mediaFeatureId: string;
    normalizeAudioAnalysisModuleResult: (
      rawValue: unknown,
      moduleId: string,
      extra: Record<string, unknown>
    ) => SnapshotRecord;
    normalizeAudioAnalysisState: (rawValue: unknown, runtime: SnapshotRecord) => SnapshotRecord;
    roomId: string;
    syncProjectFeatureProjections: (runtime: SnapshotRecord, project: SnapshotRecord) => void;
    toFileUrl: (path: unknown) => string;
    toRecord: (value: unknown) => SnapshotRecord;
  };

  function getSourceRouteLabel(project: SnapshotRecord) {
    const projectSource = toRecord(project.source);
    if (projectSource.routeLabel) {
      return projectSource.routeLabel as string;
    }
    if (projectSource.mode === "youtube") {
      return "YouTube";
    }
    if (projectSource.mode === "url") {
      return "Direct URL";
    }
    return "Local copy";
  }

  function serializeProjectSummary(project: SnapshotRecord) {
    const mediaProcess = getFeatureProcessRecord(project, mediaFeatureId);
    const audioProcess = getFeatureProcessRecord(project, audioFeatureId);
    const mediaReport = getFeatureReportRecord(project, mediaFeatureId);
    const audioReport = getFeatureReportRecord(project, audioFeatureId);
    const projectSource = toRecord(project.source);
    const projectEdit = toRecord(project.edit);
    const projectProfile = toRecord(project.profile);
    const profilePreflight = toRecord(projectProfile.preflight);
    const audioAnalysis = toRecord(project.audioAnalysis);
    const workbench = toRecord(project.workbench);
    const assets = Array.isArray(project.assets) ? project.assets : [];

    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      updatedAt: project.updatedAt,
      sourceKind: projectSource.kind,
      sourceMode: projectSource.mode,
      status: projectSource.status,
      hasSource:
        typeof projectSource.storedPath === "string" && projectSource.storedPath.trim() !== "",
      handoffMode: asNonEmptyString(projectEdit.handoffMode) || "source",
      hasDerivedOutput:
        Array.isArray(projectEdit.outputs) &&
        (projectEdit.outputs as unknown[]).some(function (entry: unknown) {
          return asNonEmptyString(toRecord(entry).path) !== null;
        }),
      profileMode: asNonEmptyString(projectProfile.mode) || "beginner",
      profilePreflightStatus: asNonEmptyString(profilePreflight.status) || "idle",
      profileTargetMode: asNonEmptyString(projectProfile.targetAssetMode) || "source",
      processStatus: mediaProcess.status,
      reportStatus: mediaReport.status,
      audioProcessStatus: audioProcess.status,
      audioReportStatus: audioReport.status,
      audioModuleCount: Object.keys(toRecord(audioAnalysis.results)).length,
      assetCount: assets.length,
      workbench: clone(workbench),
    };
  }

  function serializeProject(project: SnapshotRecord | null, runtime: SnapshotRecord) {
    if (project === null) {
      return null;
    }

    const projectSource = toRecord(project.source);
    const projectEdit = toRecord(project.edit);
    const projectEditPreview = toRecord(projectEdit.preview);
    const projectProfile = toRecord(project.profile);
    const audioAnalysis = normalizeAudioAnalysisState(project.audioAnalysis, runtime);
    const workbench = toRecord(project.workbench);
    const assets = (Array.isArray(project.assets) ? (project.assets as unknown[]) : [])
      .map(function (entry: unknown) {
        return serializeLabAssetForSnapshot(entry, toFileUrl);
      })
      .filter((entry): entry is LabAsset => entry !== null);

    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      assets,
      source: {
        ...(clone(project.source) as Record<string, unknown>),
        previewUrl: toFileUrl(projectSource.storedPath),
        routeLabel: getSourceRouteLabel(project),
      },
      edit: {
        ...(clone(project.edit) as Record<string, unknown>),
        preview: {
          ...(clone(projectEditPreview) as Record<string, unknown>),
          previewUrl: toFileUrl(projectEditPreview.path),
          artifacts: (Array.isArray(projectEditPreview.artifacts)
            ? (projectEditPreview.artifacts as unknown[])
            : []
          ).map(function (entry: unknown) {
            return {
              ...(clone(entry) as Record<string, unknown>),
              previewUrl: toFileUrl(toRecord(entry).path),
            };
          }),
        },
        outputs: (Array.isArray(projectEdit.outputs) ? (projectEdit.outputs as unknown[]) : []).map(
          function (entry: unknown) {
            const entryRecord = toRecord(entry);
            return {
              ...(clone(entry) as Record<string, unknown>),
              previewUrl: toFileUrl(entryRecord.path),
              artifacts: (Array.isArray(entryRecord.artifacts)
                ? (entryRecord.artifacts as unknown[])
                : []
              ).map(function (artifact: unknown) {
                return {
                  ...(clone(artifact) as Record<string, unknown>),
                  previewUrl: toFileUrl(toRecord(artifact).path),
                };
              }),
            };
          }
        ),
      },
      profile: {
        ...(clone(project.profile) as Record<string, unknown>),
        artifacts: (Array.isArray(projectProfile.artifacts)
          ? (projectProfile.artifacts as unknown[])
          : []
        ).map(function (entry: unknown) {
          const entryRecord = toRecord(entry);
          return {
            ...(clone(entry) as Record<string, unknown>),
            previewUrl: toFileUrl(entryRecord.path),
          };
        }),
      },
      audioAnalysis: {
        ...(clone(audioAnalysis) as Record<string, unknown>),
        results: Object.keys(toRecord(audioAnalysis.results)).reduce(
          function (accumulator: Record<string, unknown>, moduleId: string) {
            const result = normalizeAudioAnalysisModuleResult(
              toRecord(toRecord(audioAnalysis.results)[moduleId]),
              moduleId,
              {}
            );
            accumulator[moduleId] = {
              ...(clone(result) as Record<string, unknown>),
              artifacts: (Array.isArray(result.artifacts) ? result.artifacts : []).map(function (
                entry: unknown
              ) {
                return {
                  ...(clone(entry) as Record<string, unknown>),
                  previewUrl: toFileUrl(toRecord(entry).path),
                };
              }),
            };
            return accumulator;
          },
          {} as Record<string, unknown>
        ),
        export: {
          ...(clone(toRecord(audioAnalysis.export)) as Record<string, unknown>),
          items: (Array.isArray(toRecord(audioAnalysis.export).items)
            ? (toRecord(audioAnalysis.export).items as unknown[])
            : []
          ).map(function (entry: unknown) {
            return {
              ...(clone(entry) as Record<string, unknown>),
              fileUrl: toFileUrl(toRecord(entry).path),
            };
          }),
        },
      },
      workbench: clone(workbench),
      process: {
        ...(clone(project.process) as Record<string, unknown>),
        records: featureIds.reduce(
          function (accumulator: Record<string, unknown>, featureId: string) {
            const record = getFeatureProcessRecord(project, featureId);
            accumulator[featureId] = {
              ...(clone(record) as Record<string, unknown>),
              artifacts: (Array.isArray(record.artifacts) ? record.artifacts : []).map(function (
                entry: unknown
              ) {
                return {
                  ...(clone(entry) as Record<string, unknown>),
                  previewUrl: toFileUrl(toRecord(entry).path),
                };
              }),
            };
            return accumulator;
          },
          {} as Record<string, unknown>
        ),
      },
      report: {
        ...(clone(project.report) as Record<string, unknown>),
        records: featureIds.reduce(
          function (accumulator: Record<string, unknown>, featureId: string) {
            const record = getFeatureReportRecord(project, featureId);
            accumulator[featureId] = {
              ...(clone(record) as Record<string, unknown>),
              exports: (Array.isArray(record.exports) ? record.exports : []).map(function (
                entry: unknown
              ) {
                return {
                  ...(clone(entry) as Record<string, unknown>),
                  fileUrl: toFileUrl(toRecord(entry).path),
                };
              }),
            };
            return accumulator;
          },
          {} as Record<string, unknown>
        ),
      },
    };
  }

  function getRuntimeRecord(runtime: unknown) {
    return runtime && typeof runtime === "object" && Array.isArray(runtime) === false
      ? (runtime as SnapshotRecord)
      : ({} as SnapshotRecord);
  }

  function buildProjectedProjects(runtime: SnapshotRecord) {
    const runtimeRecord = getRuntimeRecord(runtime);
    const projects = Array.isArray(runtimeRecord.projects)
      ? (runtimeRecord.projects as unknown[])
      : [];
    return projects.map(function (project: unknown) {
      const nextProject = clone(project) as SnapshotRecord;
      syncProjectFeatureProjections(runtimeRecord, nextProject);
      return nextProject;
    });
  }

  function serializeJobs(runtime: SnapshotRecord) {
    const runtimeRecord = getRuntimeRecord(runtime);
    return Object.keys(toRecord(runtimeRecord.jobs))
      .map(function (jobId: string) {
        const job = toRecord(runtimeRecord.jobs)[jobId] as SnapshotRecord | undefined;
        if (!job) {
          return null;
        }

        return {
          jobId: jobId,
          requestId: job.requestId,
          action: job.action,
          projectId: job.projectId || null,
          toolId: job.toolId || null,
          featureStage: job.featureStage || null,
          operation: job["operation"] || null,
          stage: job.stage || "queued",
          percent: typeof job.percent === "number" ? job.percent : null,
          bytesReceived: typeof job["bytesReceived"] === "number" ? job["bytesReceived"] : null,
          bytesTotal: typeof job["bytesTotal"] === "number" ? job["bytesTotal"] : null,
          message: job.message || null,
        };
      })
      .filter(Boolean);
  }

  function buildToolRegistry(runtime: SnapshotRecord) {
    const runtimeRecord = getRuntimeRecord(runtime);
    return getRuntimeToolIds(runtimeRecord).map(function (toolId: string) {
      const toolManifest = getToolManifest(runtimeRecord, toolId);
      const systemCommand = toRecord(toolManifest.systemCommand);
      const stageSupport: Record<string, string> = {};

      mediaStages.forEach(function (stageId: string) {
        const supportLevel = getStageSupport(toolManifest, stageId);
        if (supportLevel !== "unsupported") {
          stageSupport[stageId] = supportLevel;
        }
      });

      const usedBy = Array.isArray(toolManifest.usedBy)
        ? (toolManifest.usedBy as unknown[]).map(function (entry) {
            return String(entry);
          })
        : [];
      const testImpact = Array.isArray(toolManifest.testImpact)
        ? (toolManifest.testImpact as unknown[]).map(function (entry) {
            return String(entry);
          })
        : [];
      const availability = asNonEmptyString(toolManifest.availability) || "installable";
      const installer = toRecord(toolManifest.installer);
      const installerType = asNonEmptyString(installer["type"]);
      const installPackages = Array.isArray(installer["packages"])
        ? (installer["packages"] as unknown[]).map(function (entry) {
            return String(entry);
          })
        : [];
      const supportedPythonVersions = Array.isArray(installer["supportedPythonVersions"])
        ? (installer["supportedPythonVersions"] as unknown[]).map(function (entry) {
            return String(entry);
          })
        : [];
      const manifestInstallStrategy = asNonEmptyString(toolManifest.installStrategy);
      const installStrategy =
        availability === "planned" || manifestInstallStrategy === "planned"
          ? "planned"
          : "automatic";

      return {
        toolId: toolId,
        displayName: asNonEmptyString(toolManifest.displayName) || toolId,
        installDirName: asNonEmptyString(toolManifest.installDirName) || toolId,
        availability,
        plannedReason: asNonEmptyString(toolManifest.plannedReason),
        commandName: asNonEmptyString(systemCommand.executableName),
        envVarNames: Array.isArray(systemCommand.envVarNames)
          ? (systemCommand.envVarNames as unknown[]).map(function (entry) {
              return String(entry);
            })
          : [],
        installerType,
        installPackages,
        estimatedDownloadSize: asNonEmptyString(installer["estimatedDownloadSize"]),
        estimatedInstalledSize: asNonEmptyString(installer["estimatedInstalledSize"]),
        supportedPythonVersions,
        venvDir: asNonEmptyString(installer["venvDir"]),
        setupHint: asNonEmptyString(systemCommand.setupHint),
        installStrategy,
        usedBy,
        testImpact,
        readinessImpact: asNonEmptyString(toolManifest.readinessImpact),
        stageSupport: stageSupport,
      };
    });
  }

  function buildWorkbenchSnapshot(featureId: string, workbenchSource: unknown = {}) {
    return createLaboratoryWorkbenchState({
      ...toRecord(workbenchSource),
      primaryFeatureId: mediaFeatureId,
      activeModuleId: featureId || defaultFeatureId,
      availableModuleIds: featureIds.slice(),
    });
  }

  function getWorkbenchSourceResetAt(workbenchSource: unknown) {
    return asNonEmptyString(toRecord(workbenchSource)["sourceActivationResetAt"]);
  }

  function shouldUseContextWorkbench(projectWorkbench: unknown, contextWorkbench: unknown) {
    const projectResetAt = getWorkbenchSourceResetAt(projectWorkbench);
    if (projectResetAt === null) {
      return true;
    }
    return getWorkbenchSourceResetAt(contextWorkbench) === projectResetAt;
  }

  function buildMediaSnapshot(
    runtime: SnapshotRecord,
    featureId: string,
    workbenchSource: unknown = {}
  ) {
    const runtimeRecord = getRuntimeRecord(runtime);
    const projectedProjects = buildProjectedProjects(runtimeRecord);
    const activeProject =
      projectedProjects.find(function (project: SnapshotRecord) {
        return project.id === runtimeRecord.activeProjectId;
      }) || null;
    const projectWorkbench = activeProject === null ? {} : toRecord(activeProject.workbench);
    const contextWorkbench = toRecord(workbenchSource);
    const workbenchSnapshot = buildWorkbenchSnapshot(featureId || defaultFeatureId, {
      ...projectWorkbench,
      ...(shouldUseContextWorkbench(projectWorkbench, contextWorkbench) ? contextWorkbench : {}),
    });

    return {
      roomId: roomId,
      featureId: featureId || defaultFeatureId,
      workbench: workbenchSnapshot,
      bootstrap: clone(runtimeRecord.bootstrap || {}),
      ready: runtimeRecord.hydrated === true,
      stages: mediaStages.slice(),
      sourcePresets: clone(runtimeRecord.sourcePresets || {}),
      ytDlpForm: clone(runtimeRecord.ytDlpForm || {}),
      editPresets: clone(runtimeRecord.editPresets || {}),
      editCapabilities: clone(runtimeRecord.editCapabilities || {}),
      profilePresets: clone(runtimeRecord.profilePresets || {}),
      profileCapabilities: clone(runtimeRecord.profileCapabilities || {}),
      profileModels: clone(runtimeRecord.profileModels || {}),
      visualAnalysisCatalog: clone(runtimeRecord.visualAnalysisCatalog || {}),
      visualAnalysisCapabilities: clone(runtimeRecord.visualAnalysisCapabilities || {}),
      visualAnalysisProviders: clone(runtimeRecord.visualAnalysisProviders || {}),
      audioAnalysisCatalog: clone(runtimeRecord.audioAnalysisCatalog || {}),
      audioAnalysisCapabilities: clone(runtimeRecord.audioAnalysisCapabilities || {}),
      audioAnalysisPresets: clone(runtimeRecord.audioAnalysisPresets || {}),
      audioAnalysisProviders: clone(runtimeRecord.audioAnalysisProviders || {}),
      toolRegistry: buildToolRegistry(runtimeRecord),
      profileModelState: clone(runtimeRecord.profileModelState || {}),
      projects: projectedProjects.map(serializeProjectSummary),
      activeProjectId: runtimeRecord.activeProjectId,
      activeProject: serializeProject(activeProject, runtimeRecord),
      toolState: clone(runtimeRecord.toolState || { tools: {} }),
      jobs: serializeJobs(runtimeRecord),
    };
  }

  return {
    buildMediaSnapshot,
    buildToolRegistry,
    serializeJobs,
    serializeProject,
    serializeProjectSummary,
  };
}
