import { createLaboratoryCloseoutStalenessRuntime } from "./closeout-staleness.js";
import { createLaboratoryProcessReportStateRuntime } from "./process-report-state.js";
import { createLaboratoryProjectRecordsRuntime } from "./project-records.js";
import { createLaboratoryProjectStateDelegatesRuntime } from "./project-state-delegates.js";

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryProjectRecordsRuntimeDeps = Parameters<
  typeof createLaboratoryProjectRecordsRuntime
>[0];

type LaboratoryMediaProfileStateRuntime = {
  normalizeProfileArtifact: (rawValue: unknown) => unknown;
  normalizeProfileSignal: (rawValue: unknown) => unknown;
};

type LaboratoryProjectStateRuntime = {
  readFeatureProcessRecord: (project: LaboratoryRecord, featureId: string) => unknown;
  readFeatureReportRecord: (project: LaboratoryRecord, featureId: string) => unknown;
  serializeProject: (project: LaboratoryRecord, runtime: unknown) => unknown;
  serializeProjectSummary: (project: LaboratoryRecord) => unknown;
  syncProjectFeatureProjections: (runtime: unknown, project: LaboratoryRecord) => unknown;
};

type LaboratoryHostStateCompositionDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  buildProjectName: (dateValue: string | number | Date) => string;
  buildProjectSlug: (dateValue: string | number | Date) => string;
  clone: <T>(value: T) => T;
  createDefaultEditState: (editPresets: unknown, sourceKind: string) => unknown;
  createDefaultProfileState: (
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ) => unknown;
  createEmptyAudioAnalysisState: () => unknown;
  createEmptySourceDrafts: (sourcePresets: unknown) => LaboratoryRecord;
  featureIds: string[];
  getDefaultMode: (sourcePresets: unknown, sourceKind: string) => string;
  getDefaultSourceType: (sourcePresets: unknown) => string;
  getDefaultYoutubePreset: (sourcePresets: unknown) => string;
  getMediaProfileStateRuntime: () => LaboratoryMediaProfileStateRuntime;
  getPreferredFeatureSourceKind: (featureId: unknown, sourcePresets: unknown) => string;
  getPresetDefaultCustomValues: (sourcePresets: unknown, presetId: string) => LaboratoryRecord;
  getProjectStateRuntime: () => LaboratoryProjectStateRuntime;
  markFeatureProcessStale: (
    project: LaboratoryRecord,
    featureId: string,
    reason: string
  ) => unknown;
  markFeatureReportStale: (project: LaboratoryRecord, featureId: string, reason: string) => unknown;
  normalizeAudioAnalysisState: (rawValue: unknown, runtime: unknown) => unknown;
  normalizeEditState: (rawValue: unknown, editPresets: unknown, sourceKind: string) => unknown;
  normalizeProfileState: (
    rawValue: unknown,
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ) => unknown;
  normalizeSourceMetadata: (rawValue: unknown) => LaboratoryRecord | null;
  normalizeStringArray: (value: unknown) => string[];
  projectSchemaVersion: number;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryHostStateCompositionRuntime(
  deps: LaboratoryHostStateCompositionDeps
) {
  const laboratoryProcessReportStateRuntime = createLaboratoryProcessReportStateRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: deps.asNumber,
    featureIds: deps.featureIds,
    normalizeProfileArtifact: deps.getMediaProfileStateRuntime().normalizeProfileArtifact,
    normalizeProfileSignal: deps.getMediaProfileStateRuntime().normalizeProfileSignal,
    toRecord: deps.toRecord,
  });
  const {
    createEmptyFeatureProcessRecord,
    createEmptyProcessState,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    normalizeProcessModule,
    normalizeFeatureProcessRecord,
    normalizeProcessState,
    createEmptyFeatureReportRecord,
    createEmptyReportState,
    normalizeReportSummaryCard,
    normalizeReportExport,
    normalizeFeatureReportRecord,
    normalizeReportState,
    getFeatureProcessRecord,
    setFeatureProcessRecord,
    getFeatureReportRecord,
    setFeatureReportRecord,
  } = laboratoryProcessReportStateRuntime;

  const laboratoryCloseoutStalenessRuntime = createLaboratoryCloseoutStalenessRuntime({
    featureIds: deps.featureIds,
    getFeatureProcessRecord,
    setFeatureProcessRecord,
    getFeatureReportRecord,
    setFeatureReportRecord,
  });

  const laboratoryProjectStateDelegatesRuntime = createLaboratoryProjectStateDelegatesRuntime({
    getMediaProfileStateRuntime: deps.getMediaProfileStateRuntime,
    getProcessReportStateRuntime() {
      return laboratoryProcessReportStateRuntime;
    },
    getProjectStateRuntime: deps.getProjectStateRuntime,
  });

  const laboratoryProjectRecordsRuntimeDeps: LaboratoryProjectRecordsRuntimeDeps = {
    asNonEmptyString: deps.asNonEmptyString,
    buildProjectName: deps.buildProjectName,
    buildProjectSlug: deps.buildProjectSlug,
    clone: deps.clone,
    createDefaultEditState: deps.createDefaultEditState,
    createDefaultProfileState: deps.createDefaultProfileState,
    createEmptyAudioAnalysisState: deps.createEmptyAudioAnalysisState,
    createEmptyProcessState,
    createEmptyReportState,
    createEmptySourceDrafts: deps.createEmptySourceDrafts,
    getDefaultMode: deps.getDefaultMode,
    getDefaultSourceType: deps.getDefaultSourceType,
    getDefaultYoutubePreset: deps.getDefaultYoutubePreset,
    getPreferredFeatureSourceKind: deps.getPreferredFeatureSourceKind,
    getPresetDefaultCustomValues: deps.getPresetDefaultCustomValues,
    normalizeAudioAnalysisState: deps.normalizeAudioAnalysisState,
    normalizeEditState: deps.normalizeEditState,
    normalizeProfileState: deps.normalizeProfileState,
    normalizeProcessState,
    normalizeReportState,
    normalizeSourceMetadata: deps.normalizeSourceMetadata,
    projectSchemaVersion: deps.projectSchemaVersion,
    toRecord: deps.toRecord,
  };
  const laboratoryProjectRecordsRuntime = createLaboratoryProjectRecordsRuntime(
    laboratoryProjectRecordsRuntimeDeps
  );
  const {
    createProjectRecord,
    findProject,
    getActiveProject,
    normalizeProject,
    updateProjectTimestamps,
  } = laboratoryProjectRecordsRuntime;

  return {
    createEmptyFeatureProcessRecord,
    createEmptyFeatureReportRecord,
    createEmptyProcessState,
    createEmptyReportState,
    createProjectRecord,
    findProject,
    getActiveProject,
    getFeatureProcessRecord,
    getFeatureReportRecord,
    laboratoryCloseoutStalenessRuntime,
    laboratoryProcessReportStateRuntime,
    laboratoryProjectRecordsRuntime,
    laboratoryProjectStateDelegatesRuntime,
    normalizeFeatureProcessRecord,
    normalizeFeatureReportRecord,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    normalizeProcessModule,
    normalizeProcessState,
    normalizeReportExport,
    normalizeReportState,
    normalizeReportSummaryCard,
    normalizeProject,
    setFeatureProcessRecord,
    setFeatureReportRecord,
    updateProjectTimestamps,
  };
}
