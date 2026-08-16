type LaboratoryRecord = Record<string, unknown>;

type LaboratoryRuntimeWithProfiles = LaboratoryRecord & {
  profileModels: unknown;
};

type LaboratoryRuntimeStorageDeps = {
  lifecycleRuntime: {
    loadProfileModelState: (runtime: LaboratoryRuntimeWithProfiles) => Promise<unknown>;
    loadProjects: (runtime: LaboratoryRuntimeWithProfiles) => Promise<unknown>;
    loadRuntimeConfigs: (api: unknown, runtime: LaboratoryRuntimeWithProfiles) => Promise<unknown>;
    loadToolState: (runtime: LaboratoryRuntimeWithProfiles) => Promise<unknown>;
    persistProfileModelState: (runtime: LaboratoryRuntimeWithProfiles) => Promise<unknown>;
    persistToolState: (runtime: LaboratoryRuntimeWithProfiles) => Promise<unknown>;
    saveProject: (
      runtime: LaboratoryRuntimeWithProfiles,
      project: LaboratoryRecord
    ) => Promise<unknown>;
  };
  profileModelRuntime: {
    refreshProfileModelStateWithStorage: (
      runtime: LaboratoryRuntimeWithProfiles
    ) => Promise<unknown>;
  };
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryRuntimeStorage(deps: LaboratoryRuntimeStorageDeps) {
  const { lifecycleRuntime, profileModelRuntime, toRecord } = deps;

  async function loadRuntimeConfigs(api: unknown, runtime: LaboratoryRuntimeWithProfiles) {
    return lifecycleRuntime.loadRuntimeConfigs(api, runtime);
  }

  async function loadProjects(runtime: LaboratoryRuntimeWithProfiles) {
    return lifecycleRuntime.loadProjects(runtime);
  }

  async function saveProject(runtime: LaboratoryRuntimeWithProfiles, project: LaboratoryRecord) {
    return lifecycleRuntime.saveProject(runtime, project);
  }

  async function persistToolState(runtime: LaboratoryRuntimeWithProfiles) {
    return lifecycleRuntime.persistToolState(runtime);
  }

  async function persistProfileModelState(runtime: LaboratoryRuntimeWithProfiles) {
    return lifecycleRuntime.persistProfileModelState(runtime);
  }

  async function loadToolState(runtime: LaboratoryRuntimeWithProfiles) {
    return lifecycleRuntime.loadToolState(runtime);
  }

  async function loadProfileModelState(runtime: LaboratoryRuntimeWithProfiles) {
    return lifecycleRuntime.loadProfileModelState(runtime);
  }

  function getProfileModelDescriptorMap(runtime: LaboratoryRuntimeWithProfiles) {
    return toRecord(toRecord(runtime.profileModels)["models"]);
  }

  function getProfileModelDescriptor(runtime: LaboratoryRuntimeWithProfiles, modelId: string) {
    return toRecord(getProfileModelDescriptorMap(runtime)[modelId]);
  }

  async function refreshProfileModelState(runtime: LaboratoryRuntimeWithProfiles) {
    return profileModelRuntime.refreshProfileModelStateWithStorage(runtime);
  }

  return {
    getProfileModelDescriptor,
    getProfileModelDescriptorMap,
    loadProfileModelState,
    loadProjects,
    loadRuntimeConfigs,
    loadToolState,
    persistProfileModelState,
    persistToolState,
    refreshProfileModelState,
    saveProject,
  };
}
