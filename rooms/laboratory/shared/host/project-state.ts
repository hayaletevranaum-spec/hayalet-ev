type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProjectStateRuntimeDeps = {
  roomSnapshotRuntime: {
    serializeProject: (project: LaboratoryRecord, runtime: unknown) => unknown;
    serializeProjectSummary: (project: LaboratoryRecord) => unknown;
  };
  runtimeStorage: {
    getFeatureProcessRecord: (project: LaboratoryRecord, featureId: string) => unknown;
    getFeatureReportRecord: (project: LaboratoryRecord, featureId: string) => unknown;
    getProfileModelDescriptor: (runtime: unknown, modelId: string) => unknown;
    getProfileModelDescriptorMap: (runtime: unknown) => unknown;
    persistProfileModelState: (runtime: unknown) => unknown;
    persistToolState: (runtime: unknown) => unknown;
    refreshProfileModelState: (runtime: unknown) => unknown;
  };
  syncProjectAudioAnalysisProjection: (runtime: unknown, project: LaboratoryRecord) => unknown;
  syncProjectProfileProjection: (runtime: unknown, project: LaboratoryRecord) => unknown;
  toFileUrl: (path: string) => string;
};

export function createLaboratoryProjectStateRuntime(deps: LaboratoryProjectStateRuntimeDeps) {
  const {
    roomSnapshotRuntime,
    runtimeStorage,
    syncProjectAudioAnalysisProjection,
    syncProjectProfileProjection,
    toFileUrl,
  } = deps;

  function serializeProjectSummary(project: LaboratoryRecord) {
    return roomSnapshotRuntime.serializeProjectSummary(project);
  }

  function serializeProject(project: LaboratoryRecord, runtime: unknown) {
    return roomSnapshotRuntime.serializeProject(project, runtime);
  }

  function syncProjectFeatureProjections(
    runtime: unknown,
    project: LaboratoryRecord
  ): LaboratoryRecord {
    syncProjectProfileProjection(runtime, project);
    syncProjectAudioAnalysisProjection(runtime, project);
    return project;
  }

  function readFeatureProcessRecord(project: LaboratoryRecord, featureId: string) {
    return runtimeStorage.getFeatureProcessRecord(project, featureId);
  }

  function readFeatureReportRecord(project: LaboratoryRecord, featureId: string) {
    return runtimeStorage.getFeatureReportRecord(project, featureId);
  }

  function readProfileModelDescriptor(runtime: unknown, modelId: string) {
    return runtimeStorage.getProfileModelDescriptor(runtime, modelId);
  }

  function readProfileModelDescriptorMap(runtime: unknown) {
    return runtimeStorage.getProfileModelDescriptorMap(runtime);
  }

  function saveProfileModelState(runtime: unknown) {
    return runtimeStorage.persistProfileModelState(runtime);
  }

  function saveToolState(runtime: unknown) {
    return runtimeStorage.persistToolState(runtime);
  }

  function reloadProfileModelState(runtime: unknown) {
    return runtimeStorage.refreshProfileModelState(runtime);
  }

  return {
    readFeatureProcessRecord: readFeatureProcessRecord,
    readFeatureReportRecord: readFeatureReportRecord,
    readProfileModelDescriptor: readProfileModelDescriptor,
    readProfileModelDescriptorMap: readProfileModelDescriptorMap,
    reloadProfileModelState: reloadProfileModelState,
    saveProfileModelState: saveProfileModelState,
    saveToolState: saveToolState,
    serializeProject: serializeProject,
    serializeProjectSummary: serializeProjectSummary,
    syncProjectFeatureProjections: syncProjectFeatureProjections,
    toFileUrl: toFileUrl,
  };
}
