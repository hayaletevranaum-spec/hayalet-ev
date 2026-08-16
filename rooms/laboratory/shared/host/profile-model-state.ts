type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProfileModelEntry = LaboratoryRecord & {
  busy?: boolean;
  lastError?: string | null;
  modelId: string;
};

type LaboratoryProfileModelState = LaboratoryRecord & {
  models: Record<string, LaboratoryProfileModelEntry | undefined>;
};

type LaboratoryProfileModelStateRuntime = LaboratoryRecord & {
  profileModelState: LaboratoryProfileModelState;
};

type LaboratoryProjectStateRuntime = {
  readProfileModelDescriptor: (
    runtime: LaboratoryProfileModelStateRuntime,
    modelId: string
  ) => LaboratoryRecord;
  readProfileModelDescriptorMap: (
    runtime: LaboratoryProfileModelStateRuntime
  ) => Record<string, LaboratoryRecord | undefined>;
  saveProfileModelState: (runtime: LaboratoryProfileModelStateRuntime) => unknown;
  saveToolState: (runtime: LaboratoryProfileModelStateRuntime) => unknown;
  reloadProfileModelState: (runtime: LaboratoryProfileModelStateRuntime) => unknown;
};

type LaboratoryProfileModelStateRuntimeDeps = {
  createDefaultProfileModelEntry: (modelId: string) => LaboratoryProfileModelEntry;
  getProjectStateRuntime: () => LaboratoryProjectStateRuntime;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryProfileModelStateRuntime(
  deps: LaboratoryProfileModelStateRuntimeDeps
) {
  const { createDefaultProfileModelEntry, getProjectStateRuntime, toRecord } = deps;

  function readProfileModelEntries(
    runtime: LaboratoryProfileModelStateRuntime
  ): Record<string, LaboratoryProfileModelEntry | undefined> {
    return toRecord(toRecord(runtime.profileModelState)["models"]) as Record<
      string,
      LaboratoryProfileModelEntry | undefined
    >;
  }

  function readProfileModelDescriptor(
    runtime: LaboratoryProfileModelStateRuntime,
    modelId: string
  ) {
    return getProjectStateRuntime().readProfileModelDescriptor(runtime, modelId);
  }

  function readProfileModelDescriptorMap(runtime: LaboratoryProfileModelStateRuntime) {
    return getProjectStateRuntime().readProfileModelDescriptorMap(runtime);
  }

  function saveProfileModelState(runtime: LaboratoryProfileModelStateRuntime) {
    return getProjectStateRuntime().saveProfileModelState(runtime);
  }

  function saveToolState(runtime: LaboratoryProfileModelStateRuntime) {
    return getProjectStateRuntime().saveToolState(runtime);
  }

  function reloadProfileModelState(runtime: LaboratoryProfileModelStateRuntime) {
    return getProjectStateRuntime().reloadProfileModelState(runtime);
  }

  function updateProfileModelEntry(
    runtime: LaboratoryProfileModelStateRuntime,
    modelId: string,
    patch: Partial<LaboratoryProfileModelEntry> | null | undefined
  ): LaboratoryProfileModelEntry {
    runtime.profileModelState.models[modelId] = {
      ...createDefaultProfileModelEntry(modelId),
      ...readProfileModelEntries(runtime)[modelId],
      ...(toRecord(patch) as Partial<LaboratoryProfileModelEntry>),
      modelId: modelId,
    };
    return runtime.profileModelState.models[modelId];
  }

  function updateProfileModelBusy(
    runtime: LaboratoryProfileModelStateRuntime,
    modelId: string,
    busy: boolean,
    lastError?: string | null
  ): LaboratoryProfileModelEntry {
    return updateProfileModelEntry(runtime, modelId, {
      busy: busy === true,
      lastError: lastError || null,
    });
  }

  return {
    readProfileModelDescriptor,
    readProfileModelDescriptorMap,
    reloadProfileModelState,
    saveProfileModelState,
    saveToolState,
    updateProfileModelBusy,
    updateProfileModelEntry,
  };
}
