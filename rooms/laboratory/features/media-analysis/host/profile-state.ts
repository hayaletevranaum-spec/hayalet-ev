type MediaProfileRecord = Record<string, unknown>;

type MediaProfileArtifactPreferences = Record<string, boolean>;
type MediaProfileLaneSelection = Record<string, boolean>;

type MediaProfileReadiness = {
  blockers: string[];
  models: unknown[];
  optionalTools: unknown[];
  requiredTools: unknown[];
  stageReady: boolean;
  warnings: string[];
};

type MediaProfileEstimate = {
  artifactCount: number;
  runtimeSeconds: number | null;
  sampleWindowSeconds: number | null;
};

type MediaProfilePreflight = {
  error: string | null;
  jobId: string | null;
  ranAt: string | null;
  requestId: string | null;
  status: string;
  targetSummary: MediaProfileRecord | null;
  warnings: string[];
};

type MediaProfileArtifact = {
  createdAt: string;
  fileName: string | null;
  id: string;
  kind: string;
  label: string | null;
  metadata: MediaProfileRecord;
  path: string | null;
};

type MediaProfileSignal = {
  artifactIds: string[];
  confidence: string;
  detail: string;
  evidenceCount: number;
  id: string;
  kind: string;
  laneId: string;
  level: string;
  title: string;
};

type MediaProfileState = MediaProfileRecord & {
  activePresetId: string | null;
  artifactPreferences: MediaProfileArtifactPreferences;
  artifacts: MediaProfileArtifact[];
  depth: string;
  dirty: boolean;
  estimate: MediaProfileEstimate;
  frameSampleDensity: string;
  laneSelection: MediaProfileLaneSelection;
  lastActionAt: string | null;
  lastError: string | null;
  mode: string;
  modelId: string | null;
  preflight: MediaProfilePreflight;
  readiness: MediaProfileReadiness;
  sensitivity: number;
  signals: MediaProfileSignal[];
  targetAssetMode: "source" | "derived";
  targetAssetSignature: string | null;
  targetOutputId: string | null;
  transcriptSampleSeconds: number;
};

type MediaProfileProjectRecord = MediaProfileRecord & {
  profile: MediaProfileState | MediaProfileRecord;
  source: MediaProfileRecord;
};

type MediaProfileRuntimeRecord = MediaProfileRecord & {
  profileCapabilities: unknown;
  profileModels: unknown;
  profilePresets: unknown;
};

type MediaProfileStateRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  clampNumber: (value: unknown, minValue: number, maxValue: number, fallback: number) => number;
  createEmptyProfileEstimate: () => MediaProfileEstimate;
  createEmptyProfilePreflight: () => MediaProfilePreflight;
  createEmptyProfileReadiness: () => MediaProfileReadiness;
  findProfilePreset: (
    profilePresets: unknown,
    sourceKind: string,
    presetId: unknown
  ) => unknown | null;
  getCompatibleProfileLaneIds: (profilePresets: unknown, sourceKind: string) => string[];
  getDefaultProfileModelId: (profileModels: unknown, sourceKind: string) => string | null;
  getDefaultProfilePresetId: (profilePresets: unknown, sourceKind: string) => string | null;
  getProfileArtifactPreferenceMap: (profileCapabilities: unknown) => MediaProfileRecord;
  getProfileLaneMap: (profilePresets: unknown) => MediaProfileRecord;
  markCloseoutAsStale: (
    project: MediaProfileProjectRecord,
    reason: string | null,
    targetFeatureIds?: string[] | null
  ) => void;
  mediaFeatureId: string;
  toRecord: (value: unknown) => MediaProfileRecord;
};

export function createMediaProfileStateRuntime(deps: MediaProfileStateRuntimeDeps) {
  const asNonEmptyString = deps["asNonEmptyString"];
  const asNumber = deps["asNumber"];
  const clampNumber = deps["clampNumber"];
  const createEmptyProfileEstimate = deps["createEmptyProfileEstimate"];
  const createEmptyProfilePreflight = deps["createEmptyProfilePreflight"];
  const createEmptyProfileReadiness = deps["createEmptyProfileReadiness"];
  const findProfilePreset = deps["findProfilePreset"];
  const getCompatibleProfileLaneIds = deps["getCompatibleProfileLaneIds"];
  const getDefaultProfileModelId = deps["getDefaultProfileModelId"];
  const getDefaultProfilePresetId = deps["getDefaultProfilePresetId"];
  const getProfileArtifactPreferenceMap = deps["getProfileArtifactPreferenceMap"];
  const getProfileLaneMap = deps["getProfileLaneMap"];
  const markCloseoutAsStale = deps["markCloseoutAsStale"];
  const mediaFeatureId = deps["mediaFeatureId"];
  const toRecord = deps["toRecord"];

  function getProfileSamplingConfig(profileCapabilities: unknown): MediaProfileRecord {
    return toRecord(toRecord(profileCapabilities)["sampling"]);
  }

  function getProfileFrameDensityConfig(
    profileCapabilities: unknown,
    densityId: string
  ): MediaProfileRecord {
    const densityModes = toRecord(
      toRecord(getProfileSamplingConfig(profileCapabilities))["frameDensityModes"]
    );
    return toRecord(densityModes[asNonEmptyString(densityId) || "balanced"]);
  }

  function clampProfileTranscriptSampleSeconds(
    profileCapabilities: unknown,
    value: unknown
  ): number {
    const config = toRecord(
      toRecord(getProfileSamplingConfig(profileCapabilities))["transcriptSampleSeconds"]
    );
    const minValue = Math.max(5, Math.round(asNumber(config["min"]) || 15));
    const maxValue = Math.max(minValue, Math.round(asNumber(config["max"]) || 90));
    const stepValue = Math.max(1, Math.round(asNumber(config["step"]) || 15));
    const fallback = Math.max(
      minValue,
      Math.min(maxValue, Math.round(asNumber(config["defaultValue"]) || 45))
    );
    const normalizedValue = Math.max(
      minValue,
      Math.min(maxValue, Math.round(asNumber(value) || fallback))
    );
    return Math.max(
      minValue,
      Math.min(maxValue, Math.round(normalizedValue / stepValue) * stepValue)
    );
  }

  function normalizeProfileArtifactPreferences(
    rawValue: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ): MediaProfileArtifactPreferences {
    const preferenceMap = getProfileArtifactPreferenceMap(profileCapabilities);
    const source = toRecord(rawValue);
    const normalized: MediaProfileArtifactPreferences = {};

    Object.keys(preferenceMap).forEach(function (artifactId: string) {
      const descriptor = toRecord(preferenceMap[artifactId]);
      const mediaKinds = Array.isArray(descriptor["mediaKinds"]) ? descriptor["mediaKinds"] : [];
      const compatible = mediaKinds.length === 0 || mediaKinds.includes(sourceKind);
      normalized[artifactId] =
        compatible &&
        (Object.prototype.hasOwnProperty.call(source, artifactId)
          ? source[artifactId] === true
          : descriptor["defaultEnabled"] !== false);
    });

    return normalized;
  }

  function applyProfilePresetPatch(
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string,
    profileState: MediaProfileState,
    presetId: string
  ): MediaProfileState {
    const preset = findProfilePreset(profilePresets, sourceKind, presetId);
    if (!preset) {
      return profileState;
    }

    const patch = toRecord(toRecord(preset)["patch"]);
    const laneIds = getCompatibleProfileLaneIds(profilePresets, sourceKind);
    const lanePatch = toRecord(patch["laneSelection"]);
    const nextLaneSelection: MediaProfileLaneSelection = {};
    laneIds.forEach(function (laneId: string) {
      nextLaneSelection[laneId] = Object.prototype.hasOwnProperty.call(lanePatch, laneId)
        ? lanePatch[laneId] === true
        : profileState["laneSelection"][laneId] === true;
    });

    const requestedModelId = asNonEmptyString(patch["modelId"]);
    const requestedFrameSampleDensity = asNonEmptyString(patch["frameSampleDensity"]);
    const fallbackModelId = getDefaultProfileModelId(profileModels, sourceKind);
    const nextArtifactPreferences = normalizeProfileArtifactPreferences(
      {
        ...toRecord(profileState["artifactPreferences"]),
        ...toRecord(patch["artifactPreferences"]),
      },
      profileCapabilities,
      sourceKind
    );

    return {
      ...profileState,
      activePresetId: asNonEmptyString(toRecord(preset)["id"]),
      targetAssetMode:
        asNonEmptyString(patch["targetAssetMode"]) === "derived" ? "derived" : "source",
      depth: asNonEmptyString(patch["depth"]) || profileState["depth"],
      sensitivity: clampNumber(patch["sensitivity"], 0.1, 1, profileState["sensitivity"]),
      frameSampleDensity:
        requestedFrameSampleDensity &&
        ["sparse", "balanced", "dense"].includes(requestedFrameSampleDensity)
          ? requestedFrameSampleDensity
          : profileState["frameSampleDensity"],
      transcriptSampleSeconds: clampProfileTranscriptSampleSeconds(
        profileCapabilities,
        patch["transcriptSampleSeconds"]
      ),
      modelId: requestedModelId || fallbackModelId,
      artifactPreferences: nextArtifactPreferences,
      laneSelection: nextLaneSelection,
    };
  }

  function createDefaultProfileState(
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ): MediaProfileState {
    const defaultDepth = asNonEmptyString(toRecord(profilePresets)["defaultDepth"]) || "balanced";
    const defaultSensitivity = clampNumber(
      toRecord(profilePresets)["defaultSensitivity"],
      0.1,
      1,
      0.58
    );
    const modelId = getDefaultProfileModelId(profileModels, sourceKind);
    const defaultSampling = getProfileSamplingConfig(profileCapabilities);
    const laneSelection: MediaProfileLaneSelection = {};
    getCompatibleProfileLaneIds(profilePresets, sourceKind).forEach(function (laneId: string) {
      laneSelection[laneId] =
        toRecord(getProfileLaneMap(profilePresets)[laneId])["supportsBeginner"] === true;
    });

    let profileState: MediaProfileState = {
      mode: asNonEmptyString(toRecord(profilePresets)["defaultMode"]) || "beginner",
      dirty: false,
      activePresetId: null,
      targetAssetMode: "source",
      targetOutputId: null,
      targetAssetSignature: null,
      depth: defaultDepth,
      sensitivity: defaultSensitivity,
      frameSampleDensity:
        asNonEmptyString(toRecord(defaultSampling)["defaultFrameDensity"]) || "balanced",
      transcriptSampleSeconds: clampProfileTranscriptSampleSeconds(
        profileCapabilities,
        toRecord(toRecord(defaultSampling)["transcriptSampleSeconds"])["defaultValue"]
      ),
      modelId: modelId,
      artifactPreferences: normalizeProfileArtifactPreferences({}, profileCapabilities, sourceKind),
      laneSelection: laneSelection,
      readiness: createEmptyProfileReadiness(),
      estimate: createEmptyProfileEstimate(),
      preflight: createEmptyProfilePreflight(),
      signals: [],
      artifacts: [],
      lastError: null,
      lastActionAt: null,
    };

    const defaultPresetId = getDefaultProfilePresetId(profilePresets, sourceKind);
    if (defaultPresetId) {
      profileState = applyProfilePresetPatch(
        profilePresets,
        profileModels,
        profileCapabilities,
        sourceKind,
        profileState,
        defaultPresetId
      );
    }

    return profileState;
  }

  function resetProfileForCurrentSource(
    runtime: MediaProfileRuntimeRecord,
    nextProject: MediaProfileProjectRecord,
    reason: string
  ): void {
    const previousMode = asNonEmptyString(toRecord(nextProject["profile"])["mode"]);
    const previousPresetId = asNonEmptyString(toRecord(nextProject["profile"])["activePresetId"]);
    const sourceKind = asNonEmptyString(toRecord(nextProject["source"])["kind"]) || "video";
    const nextProfile = createDefaultProfileState(
      runtime["profilePresets"],
      runtime["profileModels"],
      runtime["profileCapabilities"],
      sourceKind
    );

    if (previousMode === "advanced") {
      nextProfile["mode"] = "advanced";
    }
    if (findProfilePreset(runtime["profilePresets"], sourceKind, previousPresetId) !== null) {
      nextProfile["activePresetId"] = previousPresetId;
    }

    nextProfile["dirty"] = true;
    nextProfile["lastError"] = null;
    nextProfile["lastActionAt"] = new Date().toISOString();
    nextProfile["preflight"] = {
      ...createEmptyProfilePreflight(),
      status: "idle",
      warnings: reason ? [reason] : [],
    };
    nextProject["profile"] = nextProfile;
    markCloseoutAsStale(nextProject, reason || "Source media changed.");
  }

  function normalizeProfileArtifact(rawValue: unknown): MediaProfileArtifact {
    const source = toRecord(rawValue);
    return {
      id: asNonEmptyString(source["id"]) || `profile-artifact-${Date.now()}`,
      kind: asNonEmptyString(source["kind"]) || "artifact",
      path: asNonEmptyString(source["path"]),
      fileName: asNonEmptyString(source["fileName"]),
      label: asNonEmptyString(source["label"]),
      createdAt: asNonEmptyString(source["createdAt"]) || new Date().toISOString(),
      metadata: toRecord(source["metadata"]),
    };
  }

  function normalizeProfileSignal(rawValue: unknown): MediaProfileSignal {
    const source = toRecord(rawValue);
    return {
      id: asNonEmptyString(source["id"]) || `profile-signal-${Date.now()}`,
      laneId: asNonEmptyString(source["laneId"]) || "metadata-lineage",
      kind: asNonEmptyString(source["kind"]) || "derived",
      level: asNonEmptyString(source["level"]) || "low",
      confidence: asNonEmptyString(source["confidence"]) || "low",
      title: asNonEmptyString(source["title"]) || "Signal",
      detail: asNonEmptyString(source["detail"]) || "",
      evidenceCount: Math.max(0, Math.round(asNumber(source["evidenceCount"]) || 0)),
      artifactIds: Array.isArray(source["artifactIds"])
        ? source["artifactIds"].map(asNonEmptyString).filter(function (entry): entry is string {
            return typeof entry === "string" && entry.length > 0;
          })
        : [],
    };
  }

  function normalizeProfileState(
    rawValue: unknown,
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ): MediaProfileState {
    const defaults = createDefaultProfileState(
      profilePresets,
      profileModels,
      profileCapabilities,
      sourceKind
    );
    const source = toRecord(rawValue);
    const laneSelection: MediaProfileLaneSelection = {};
    getCompatibleProfileLaneIds(profilePresets, sourceKind).forEach(function (laneId: string) {
      laneSelection[laneId] = Object.prototype.hasOwnProperty.call(
        toRecord(source["laneSelection"]),
        laneId
      )
        ? toRecord(source["laneSelection"])[laneId] === true
        : defaults["laneSelection"][laneId] === true;
    });

    const requestedPresetId =
      asNonEmptyString(source["activePresetId"]) || defaults["activePresetId"];
    const modelId =
      asNonEmptyString(source["modelId"]) || getDefaultProfileModelId(profileModels, sourceKind);
    const requestedDepth = asNonEmptyString(source["depth"]);
    const requestedFrameSampleDensity = asNonEmptyString(source["frameSampleDensity"]);
    const readiness = toRecord(source["readiness"]);
    const readinessRequiredTools = readiness["requiredTools"];
    const readinessOptionalTools = readiness["optionalTools"];
    const readinessModels = readiness["models"];
    const readinessBlockers = readiness["blockers"];
    const readinessWarnings = readiness["warnings"];
    const estimate = toRecord(source["estimate"]);
    const preflight = toRecord(source["preflight"]);
    const preflightTargetSummary = toRecord(preflight["targetSummary"]);
    const preflightWarnings = preflight["warnings"];

    return {
      mode:
        asNonEmptyString(source["mode"]) === "advanced"
          ? "advanced"
          : asNonEmptyString(source["mode"]) || defaults["mode"],
      dirty: source["dirty"] === true,
      activePresetId: findProfilePreset(profilePresets, sourceKind, requestedPresetId)
        ? requestedPresetId
        : defaults["activePresetId"],
      targetAssetMode:
        asNonEmptyString(source["targetAssetMode"]) === "derived"
          ? "derived"
          : defaults["targetAssetMode"],
      targetOutputId: asNonEmptyString(source["targetOutputId"]),
      targetAssetSignature: asNonEmptyString(source["targetAssetSignature"]),
      depth:
        requestedDepth && ["quick", "balanced", "deep"].includes(requestedDepth)
          ? requestedDepth
          : defaults["depth"],
      sensitivity: clampNumber(source["sensitivity"], 0.1, 1, defaults["sensitivity"]),
      frameSampleDensity:
        requestedFrameSampleDensity &&
        ["sparse", "balanced", "dense"].includes(requestedFrameSampleDensity)
          ? requestedFrameSampleDensity
          : defaults["frameSampleDensity"],
      transcriptSampleSeconds: clampProfileTranscriptSampleSeconds(
        profileCapabilities,
        source["transcriptSampleSeconds"]
      ),
      modelId: modelId,
      artifactPreferences: normalizeProfileArtifactPreferences(
        toRecord(source["artifactPreferences"]),
        profileCapabilities,
        sourceKind
      ),
      laneSelection: laneSelection,
      readiness: {
        ...createEmptyProfileReadiness(),
        ...readiness,
        requiredTools: Array.isArray(readinessRequiredTools)
          ? readinessRequiredTools.map(toRecord)
          : [],
        optionalTools: Array.isArray(readinessOptionalTools)
          ? readinessOptionalTools.map(toRecord)
          : [],
        models: Array.isArray(readinessModels) ? readinessModels.map(toRecord) : [],
        blockers: Array.isArray(readinessBlockers)
          ? readinessBlockers.map(function (entry: unknown) {
              return String(entry);
            })
          : [],
        warnings: Array.isArray(readinessWarnings)
          ? readinessWarnings.map(function (entry: unknown) {
              return String(entry);
            })
          : [],
      },
      estimate: {
        ...createEmptyProfileEstimate(),
        ...estimate,
        runtimeSeconds: asNumber(estimate["runtimeSeconds"]),
        artifactCount: Math.max(0, Math.round(asNumber(estimate["artifactCount"]) || 0)),
        sampleWindowSeconds: asNumber(estimate["sampleWindowSeconds"]),
      },
      preflight: {
        ...createEmptyProfilePreflight(),
        ...preflight,
        status: asNonEmptyString(preflight["status"]) || "idle",
        jobId: asNonEmptyString(preflight["jobId"]),
        requestId: asNonEmptyString(preflight["requestId"]),
        ranAt: asNonEmptyString(preflight["ranAt"]),
        targetSummary:
          Object.keys(preflightTargetSummary).length > 0 ? preflightTargetSummary : null,
        warnings: Array.isArray(preflightWarnings)
          ? preflightWarnings.map(function (entry: unknown) {
              return String(entry);
            })
          : [],
        error: asNonEmptyString(preflight["error"]),
      },
      signals: Array.isArray(source["signals"])
        ? source["signals"].map(normalizeProfileSignal)
        : [],
      artifacts: Array.isArray(source["artifacts"])
        ? source["artifacts"].map(normalizeProfileArtifact).filter(function (
            entry: MediaProfileArtifact
          ) {
            return entry["path"] !== null;
          })
        : [],
      lastError: asNonEmptyString(source["lastError"]),
      lastActionAt: asNonEmptyString(source["lastActionAt"]),
    };
  }

  function markProfileAsStale(
    nextProject: MediaProfileProjectRecord,
    reason: string,
    options: MediaProfileRecord = {}
  ): void {
    const profile = toRecord(nextProject["profile"]);
    const preflight = toRecord(profile["preflight"]);
    const staleOptions = toRecord(options);
    nextProject["profile"] = {
      ...profile,
      dirty: true,
      targetOutputId:
        staleOptions["clearTargetOutput"] === true
          ? null
          : asNonEmptyString(profile["targetOutputId"]),
      targetAssetSignature: null,
      lastError: null,
      lastActionAt: new Date().toISOString(),
      preflight: {
        ...createEmptyProfilePreflight(),
        ...preflight,
        status: asNonEmptyString(preflight["ranAt"]) !== null ? "stale" : "idle",
        jobId: null,
        requestId: null,
        error: null,
        warnings: Array.from(
          new Set([
            ...(Array.isArray(preflight["warnings"])
              ? preflight["warnings"].filter(function (entry): entry is string {
                  return typeof entry === "string" && entry.trim() !== "";
                })
              : []),
            ...(reason ? [reason] : []),
          ])
        ),
      },
    };
    markCloseoutAsStale(nextProject, reason, [mediaFeatureId]);
  }

  function getProfileDepthConfig(
    runtime: MediaProfileRuntimeRecord,
    depthId: string
  ): MediaProfileRecord {
    const depthModes = toRecord(toRecord(runtime["profileCapabilities"])["depthModes"]);
    return toRecord(depthModes[asNonEmptyString(depthId) || "balanced"]);
  }

  function getProfileFrameDensityRuntimeConfig(
    runtime: MediaProfileRuntimeRecord,
    densityId: string
  ): MediaProfileRecord {
    return getProfileFrameDensityConfig(runtime["profileCapabilities"], densityId);
  }

  function getEnabledProfileLaneIds(
    runtime: MediaProfileRuntimeRecord,
    project: MediaProfileProjectRecord
  ): string[] {
    const sourceKind = asNonEmptyString(toRecord(project["source"])["kind"]) || "video";
    const compatibleLaneIds = getCompatibleProfileLaneIds(runtime["profilePresets"], sourceKind);
    const laneSelection = toRecord(toRecord(project["profile"])["laneSelection"]);

    return compatibleLaneIds.filter(function (laneId: string) {
      return laneSelection[laneId] === true;
    });
  }

  return {
    applyProfilePresetPatch,
    clampProfileTranscriptSampleSeconds,
    createDefaultProfileState,
    getEnabledProfileLaneIds,
    getProfileDepthConfig,
    getProfileFrameDensityRuntimeConfig,
    normalizeProfileArtifact,
    normalizeProfileArtifactPreferences,
    normalizeProfileSignal,
    normalizeProfileState,
    markProfileAsStale,
    resetProfileForCurrentSource,
  };
}
