import { createLaboratoryWorkbenchState } from "./runtime-primitives.js";
import { normalizeLabAssets, syncSourceLabAssetForProject } from "./lab-assets.js";
import type { LabAsset } from "../../domain/lab-types.js";

type LaboratoryProjectRecordValue = Record<string, unknown> & {
  activeProjectId?: unknown;
  assets?: unknown;
  audioAnalysis?: unknown;
  createdAt?: unknown;
  drafts?: LaboratoryProjectRecordValue;
  edit?: unknown;
  id?: unknown;
  kind?: unknown;
  lastError?: unknown;
  metadata?: unknown;
  metadataError?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  name?: unknown;
  process?: unknown;
  profile?: unknown;
  projects?: LaboratoryProjectRecord[];
  report?: unknown;
  routeLabel?: unknown;
  schemaVersion?: unknown;
  slug?: unknown;
  source?: LaboratoryProjectRecordValue;
  sourceUrl?: unknown;
  status?: unknown;
  storedFileName?: unknown;
  storedPath?: unknown;
  updatedAt?: unknown;
  urlInput?: unknown;
  workbench?: unknown;
  youtubeCustom?: LaboratoryProjectRecordValue;
  youtubePreset?: unknown;
  youtubeUrl?: unknown;
};

type LaboratoryProjectSource = {
  drafts: LaboratoryProjectRecordValue;
  kind: string;
  lastError: string | null;
  metadata: LaboratoryProjectRecordValue | null;
  metadataError: string | null;
  mimeType: string | null;
  mode: string;
  routeLabel: string | null;
  sourceUrl: string | null;
  status: string;
  storedFileName: string | null;
  storedPath: string | null;
};

type LaboratoryProjectRecord = {
  assets: LabAsset[];
  audioAnalysis: unknown;
  createdAt: string;
  edit: unknown;
  id: string;
  name: string;
  process: unknown;
  profile: unknown;
  report: unknown;
  schemaVersion: number;
  slug: string;
  source: LaboratoryProjectSource;
  updatedAt: string;
  workbench: ReturnType<typeof createLaboratoryWorkbenchState>;
};

type LaboratoryProjectRuntimeRecord = {
  activeProjectId: string | null;
  projects: LaboratoryProjectRecord[];
};

type LaboratoryProjectRecordsRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  clone: <T>(value: T) => T;
  buildProjectName: (dateValue: string | number | Date) => string;
  buildProjectSlug: (dateValue: string | number | Date) => string;
  createDefaultEditState: (editPresets: unknown, sourceKind: string) => unknown;
  createDefaultProfileState: (
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ) => unknown;
  createEmptyAudioAnalysisState: () => unknown;
  createEmptyProcessState: () => unknown;
  createEmptyReportState: () => unknown;
  createEmptySourceDrafts: (sourcePresets: unknown) => LaboratoryProjectRecordValue;
  getDefaultMode: (sourcePresets: unknown, sourceKind: string) => string;
  getDefaultSourceType: (sourcePresets: unknown) => string;
  getDefaultYoutubePreset: (sourcePresets: unknown) => string;
  getPreferredFeatureSourceKind: (featureId: unknown, sourcePresets: unknown) => string;
  getPresetDefaultCustomValues: (
    sourcePresets: unknown,
    presetId: string
  ) => LaboratoryProjectRecordValue;
  normalizeAudioAnalysisState: (rawValue: unknown, runtime: unknown) => unknown;
  normalizeEditState: (rawValue: unknown, editPresets: unknown, sourceKind: string) => unknown;
  normalizeProcessState: (rawValue: unknown) => unknown;
  normalizeProfileState: (
    rawValue: unknown,
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ) => unknown;
  normalizeReportState: (rawValue: unknown) => unknown;
  normalizeSourceMetadata: (rawValue: unknown) => LaboratoryProjectRecordValue | null;
  projectSchemaVersion: number;
  toRecord: (value: unknown) => LaboratoryProjectRecordValue;
};

export function createLaboratoryProjectRecordsRuntime(deps: LaboratoryProjectRecordsRuntimeDeps) {
  const {
    asNonEmptyString,
    buildProjectName,
    buildProjectSlug,
    createDefaultEditState,
    createDefaultProfileState,
    createEmptyAudioAnalysisState,
    createEmptyProcessState,
    createEmptyReportState,
    createEmptySourceDrafts,
    getDefaultMode,
    getDefaultSourceType,
    getDefaultYoutubePreset,
    getPreferredFeatureSourceKind,
    getPresetDefaultCustomValues,
    normalizeEditState,
    normalizeAudioAnalysisState,
    normalizeProfileState,
    normalizeProcessState,
    normalizeReportState,
    normalizeSourceMetadata,
    projectSchemaVersion,
    toRecord,
  } = deps;

  function createProjectRecord(
    sourcePresets: unknown,
    editPresets: unknown,
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    featureId: unknown
  ): LaboratoryProjectRecord {
    const now = new Date().toISOString();
    const kind = getPreferredFeatureSourceKind(featureId, sourcePresets);
    const mode = getDefaultMode(sourcePresets, kind);
    const slug = buildProjectSlug(now);

    return {
      schemaVersion: projectSchemaVersion,
      id: slug,
      slug: slug,
      name: buildProjectName(now),
      createdAt: now,
      updatedAt: now,
      source: {
        kind: kind,
        mode: mode,
        status: "idle",
        storedPath: null,
        storedFileName: null,
        sourceUrl: null,
        mimeType: null,
        routeLabel: null,
        lastError: null,
        metadata: null,
        metadataError: null,
        drafts: createEmptySourceDrafts(sourcePresets),
      },
      edit: createDefaultEditState(editPresets, kind),
      profile: createDefaultProfileState(profilePresets, profileModels, profileCapabilities, kind),
      audioAnalysis: createEmptyAudioAnalysisState(),
      process: createEmptyProcessState(),
      report: createEmptyReportState(),
      assets: [],
      workbench: createLaboratoryWorkbenchState({
        activeModuleId: featureId,
      }),
    };
  }

  function normalizeProject(
    rawValue: unknown,
    sourcePresets: unknown,
    editPresets: unknown,
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    runtime: unknown
  ): LaboratoryProjectRecord {
    const rawProject = toRecord(rawValue);
    const source = toRecord(rawProject.source);
    const kind = asNonEmptyString(source.kind) || getDefaultSourceType(sourcePresets);
    const mode = asNonEmptyString(source.mode) || getDefaultMode(sourcePresets, kind);
    const drafts = toRecord(source.drafts);
    const defaultPreset = getDefaultYoutubePreset(sourcePresets);
    const youtubePreset = asNonEmptyString(drafts.youtubePreset) || defaultPreset;
    const currentTimestamp = new Date().toISOString();
    const schemaVersion =
      typeof rawProject.schemaVersion === "number"
        ? rawProject.schemaVersion
        : projectSchemaVersion;

    const normalizedProject: LaboratoryProjectRecord = {
      schemaVersion: schemaVersion,
      id:
        asNonEmptyString(rawProject.id) ||
        asNonEmptyString(rawProject.slug) ||
        buildProjectSlug(currentTimestamp),
      slug:
        asNonEmptyString(rawProject.slug) ||
        asNonEmptyString(rawProject.id) ||
        buildProjectSlug(currentTimestamp),
      name: asNonEmptyString(rawProject.name) || buildProjectName(currentTimestamp),
      createdAt: asNonEmptyString(rawProject.createdAt) || currentTimestamp,
      updatedAt: asNonEmptyString(rawProject.updatedAt) || currentTimestamp,
      source: {
        kind: kind,
        mode: mode,
        status: asNonEmptyString(source.status) || "idle",
        storedPath: asNonEmptyString(source.storedPath),
        storedFileName: asNonEmptyString(source.storedFileName),
        sourceUrl: asNonEmptyString(source.sourceUrl),
        mimeType: asNonEmptyString(source.mimeType),
        routeLabel: asNonEmptyString(source.routeLabel),
        lastError: asNonEmptyString(source.lastError),
        metadata: normalizeSourceMetadata(source.metadata),
        metadataError: asNonEmptyString(source.metadataError),
        drafts: {
          urlInput: asNonEmptyString(drafts.urlInput) || "",
          youtubeUrl: asNonEmptyString(drafts.youtubeUrl) || "",
          youtubePreset: youtubePreset,
          youtubeCustom: {
            ...getPresetDefaultCustomValues(sourcePresets, youtubePreset),
            ...toRecord(drafts.youtubeCustom),
          },
        },
      },
      edit: normalizeEditState(rawProject.edit, editPresets, kind),
      profile: normalizeProfileState(
        rawProject.profile,
        profilePresets,
        profileModels,
        profileCapabilities,
        kind
      ),
      audioAnalysis: normalizeAudioAnalysisState(rawProject.audioAnalysis, runtime || {}),
      process: normalizeProcessState(rawProject.process),
      report: normalizeReportState(rawProject.report),
      assets: normalizeLabAssets(rawProject.assets),
      workbench: createLaboratoryWorkbenchState({
        ...toRecord(rawProject.workbench),
      }),
    };
    normalizedProject.assets = syncSourceLabAssetForProject(
      normalizedProject,
      normalizedProject.assets
    );
    return normalizedProject;
  }

  function updateProjectTimestamps(project: LaboratoryProjectRecord) {
    project.updatedAt = new Date().toISOString();
    return project;
  }

  function findProject(runtime: LaboratoryProjectRuntimeRecord, projectId: unknown) {
    return runtime.projects.find(function (project: LaboratoryProjectRecord) {
      return project.id === projectId;
    });
  }

  function getActiveProject(runtime: LaboratoryProjectRuntimeRecord) {
    return findProject(runtime, runtime.activeProjectId) || null;
  }

  return {
    createProjectRecord,
    findProject,
    getActiveProject,
    normalizeProject,
    updateProjectTimestamps,
  };
}
