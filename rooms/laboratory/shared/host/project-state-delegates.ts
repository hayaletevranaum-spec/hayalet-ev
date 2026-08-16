type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProjectStateRuntime = {
  readFeatureProcessRecord: (project: LaboratoryRecord, featureId: string) => unknown;
  readFeatureReportRecord: (project: LaboratoryRecord, featureId: string) => unknown;
  serializeProject: (project: LaboratoryRecord, runtime: unknown) => unknown;
  serializeProjectSummary: (project: LaboratoryRecord) => unknown;
  syncProjectFeatureProjections: (runtime: unknown, project: LaboratoryRecord) => unknown;
};

type LaboratoryProjectStateDelegatesRuntimeDeps = {
  getMediaProfileStateRuntime: () => {
    normalizeProfileArtifact: (rawValue: unknown) => unknown;
    normalizeProfileSignal: (rawValue: unknown) => unknown;
  };
  getProcessReportStateRuntime: () => {
    normalizeProcessState: (rawValue: unknown) => unknown;
    normalizeReportState: (rawValue: unknown) => unknown;
  };
  getProjectStateRuntime: () => LaboratoryProjectStateRuntime;
};

export function createLaboratoryProjectStateDelegatesRuntime(
  deps: LaboratoryProjectStateDelegatesRuntimeDeps
) {
  const { getMediaProfileStateRuntime, getProcessReportStateRuntime, getProjectStateRuntime } =
    deps;

  function serializeProjectSummary(project: LaboratoryRecord) {
    return getProjectStateRuntime().serializeProjectSummary(project);
  }

  function serializeProject(project: LaboratoryRecord, runtime: unknown) {
    return getProjectStateRuntime().serializeProject(project, runtime);
  }

  function syncProjectFeatureProjections(runtime: unknown, project: LaboratoryRecord) {
    return getProjectStateRuntime().syncProjectFeatureProjections(runtime, project);
  }

  function normalizeProjectProfileArtifact(rawValue: unknown) {
    return getMediaProfileStateRuntime().normalizeProfileArtifact(rawValue);
  }

  function normalizeProjectProfileSignal(rawValue: unknown) {
    return getMediaProfileStateRuntime().normalizeProfileSignal(rawValue);
  }

  function normalizeProjectProcessState(rawValue: unknown) {
    return getProcessReportStateRuntime().normalizeProcessState(rawValue);
  }

  function normalizeProjectReportState(rawValue: unknown) {
    return getProcessReportStateRuntime().normalizeReportState(rawValue);
  }

  function readFeatureProcessRecord(project: LaboratoryRecord, featureId: string) {
    return getProjectStateRuntime().readFeatureProcessRecord(project, featureId);
  }

  function readFeatureReportRecord(project: LaboratoryRecord, featureId: string) {
    return getProjectStateRuntime().readFeatureReportRecord(project, featureId);
  }

  return {
    normalizeProjectProfileArtifact,
    normalizeProjectProfileSignal,
    normalizeProjectProcessState,
    normalizeProjectReportState,
    readFeatureProcessRecord,
    readFeatureReportRecord,
    serializeProject,
    serializeProjectSummary,
    syncProjectFeatureProjections,
  };
}
