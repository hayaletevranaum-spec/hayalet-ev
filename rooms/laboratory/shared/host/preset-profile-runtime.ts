type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProfileReadiness = {
  blockers: string[];
  models: unknown[];
  optionalTools: unknown[];
  requiredTools: unknown[];
  stageReady: boolean;
  warnings: string[];
};

type LaboratoryProfileEstimate = {
  artifactCount: number;
  runtimeSeconds: number | null;
  sampleWindowSeconds: number | null;
};

type LaboratoryProfilePreflight = {
  error: string | null;
  jobId: string | null;
  ranAt: string | null;
  requestId: string | null;
  status: "idle";
  targetSummary: LaboratoryRecord | null;
  warnings: string[];
};

type LaboratoryProfileLaneRecord = LaboratoryRecord & {
  mediaKinds?: unknown;
};

type LaboratoryProfileModelRecord = LaboratoryRecord & {
  mediaKinds?: unknown;
};

type LaboratoryPresetProfileRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryPresetProfileRuntime(deps: LaboratoryPresetProfileRuntimeDeps) {
  const { asNonEmptyString, toRecord } = deps;

  function getProfileLaneMap(profilePresets: unknown): LaboratoryRecord {
    return toRecord(toRecord(profilePresets)["lanes"]);
  }

  function getCompatibleProfileLaneIds(profilePresets: unknown, sourceKind: string): string[] {
    const laneMap = getProfileLaneMap(profilePresets);
    return Object.keys(laneMap).filter(function (laneId) {
      const lane = toRecord(laneMap[laneId]) as LaboratoryProfileLaneRecord;
      const mediaKinds = Array.isArray(lane.mediaKinds) ? lane.mediaKinds : [];
      return mediaKinds.length === 0 || mediaKinds.includes(sourceKind);
    });
  }

  function getProfilePresetList(
    profilePresets: unknown,
    sourceKind: string,
    mode: string | null
  ): unknown[] {
    const presetsByKind = toRecord(toRecord(profilePresets)["presets"]);
    const branch = toRecord(presetsByKind[sourceKind]);
    const selectedMode =
      asNonEmptyString(mode) ??
      asNonEmptyString(toRecord(profilePresets)["defaultMode"]) ??
      "beginner";
    return Array.isArray(branch[selectedMode]) ? branch[selectedMode] : [];
  }

  function findProfilePreset(
    profilePresets: unknown,
    sourceKind: string,
    presetId: unknown
  ): unknown | null {
    const targetId = asNonEmptyString(presetId);
    if (targetId === null) {
      return null;
    }

    return (
      getProfilePresetList(profilePresets, sourceKind, "beginner").find(function (entry) {
        return asNonEmptyString(toRecord(entry)["id"]) === targetId;
      }) ?? null
    );
  }

  function getDefaultProfilePresetId(profilePresets: unknown, sourceKind: string): string | null {
    const preset = toRecord(getProfilePresetList(profilePresets, sourceKind, "beginner")[0]);
    return asNonEmptyString(preset["id"]);
  }

  function getDefaultProfileModelId(profileModels: unknown, sourceKind: string): string | null {
    const modelMap = toRecord(toRecord(profileModels)["models"]);
    const preferredId = asNonEmptyString(toRecord(profileModels)["defaultModelId"]);
    const preferredModel =
      preferredId === null ? {} : (toRecord(modelMap[preferredId]) as LaboratoryProfileModelRecord);
    const preferredKinds = Array.isArray(preferredModel.mediaKinds)
      ? preferredModel.mediaKinds
      : [];

    if (
      preferredId !== null &&
      (preferredKinds.length === 0 || preferredKinds.includes(sourceKind))
    ) {
      return preferredId;
    }

    return (
      Object.keys(modelMap).find(function (modelId) {
        const model = toRecord(modelMap[modelId]) as LaboratoryProfileModelRecord;
        const mediaKinds = Array.isArray(model.mediaKinds) ? model.mediaKinds : [];
        return mediaKinds.length === 0 || mediaKinds.includes(sourceKind);
      }) ?? null
    );
  }

  function createEmptyProfileReadiness(): LaboratoryProfileReadiness {
    return {
      stageReady: false,
      requiredTools: [],
      optionalTools: [],
      models: [],
      blockers: [],
      warnings: [],
    };
  }

  function createEmptyProfileEstimate(): LaboratoryProfileEstimate {
    return {
      runtimeSeconds: null,
      artifactCount: 0,
      sampleWindowSeconds: null,
    };
  }

  function createEmptyProfilePreflight(): LaboratoryProfilePreflight {
    return {
      status: "idle",
      jobId: null,
      requestId: null,
      ranAt: null,
      targetSummary: null,
      warnings: [],
      error: null,
    };
  }

  return {
    getProfileLaneMap,
    getCompatibleProfileLaneIds,
    getProfilePresetList,
    findProfilePreset,
    getDefaultProfilePresetId,
    getDefaultProfileModelId,
    createEmptyProfileReadiness,
    createEmptyProfileEstimate,
    createEmptyProfilePreflight,
  };
}
