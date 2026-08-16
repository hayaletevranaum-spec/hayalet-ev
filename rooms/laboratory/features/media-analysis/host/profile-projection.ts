type LaboratoryRecord = Record<string, unknown>;

type LaboratoryTargetMode = "derived" | "source";

type LaboratoryMediaProfileProjectionRuntime = LaboratoryRecord & {
  profileCapabilities?: unknown;
  profileModels?: unknown;
  profilePresets?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  name?: unknown;
  profile?: unknown;
  source?: unknown;
};

type LaboratoryProjectProfileRecord = LaboratoryRecord & {
  activePresetId?: unknown;
  artifactPreferences?: unknown;
  depth?: unknown;
  dirty?: unknown;
  frameSampleDensity?: unknown;
  laneSelection?: unknown;
  modelId?: unknown;
  preflight?: unknown;
  profile?: unknown;
  targetAssetMode?: unknown;
  targetOutputId?: unknown;
  transcriptSampleSeconds?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  kind?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  storedFileName?: unknown;
  storedPath?: unknown;
};

type LaboratoryProfileLaneRecord = LaboratoryRecord & {
  artifactKinds?: unknown;
  labelKey?: unknown;
  optionalTools?: unknown;
  requiredTools?: unknown;
  summaryKey?: unknown;
};

type LaboratoryNormalizedEditOutputRecord = LaboratoryRecord & {
  fileName?: unknown;
  id?: unknown;
  label?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  path?: unknown;
};

type LaboratoryProfileToolSummaryRecord = LaboratoryRecord & {
  displayName?: unknown;
  platformSupported?: unknown;
  ready?: unknown;
};

type LaboratoryProfileModelSummaryRecord = LaboratoryRecord & {
  compatibilityReason?: unknown;
  ready?: unknown;
  runtimeCompatible?: unknown;
  selected?: unknown;
};

type LaboratoryProfilePreflightRecord = LaboratoryRecord & {
  error?: unknown;
  jobId?: unknown;
  ranAt?: unknown;
  requestId?: unknown;
  status?: unknown;
  targetSummary?: unknown;
  warnings?: unknown;
};

type LaboratoryProfileTargetSummaryRecord = LaboratoryRecord & {
  fileName?: unknown;
  label?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  outputId?: unknown;
  path?: unknown;
  reason?: unknown;
  requestedMode?: unknown;
  signature?: unknown;
  usingFallback?: unknown;
};

type LaboratoryResolvedProfileTarget = {
  fileName: string | null;
  label: string;
  metadata: LaboratoryRecord;
  mimeType: string | null;
  mode: LaboratoryTargetMode;
  outputId: string | null;
  path: string | null;
  reason: string | null;
  requestedMode: LaboratoryTargetMode;
  signature: string | null;
  usingFallback: boolean;
};

type LaboratoryProfileLaneSummary = {
  artifactKinds: string[];
  labelKey: string | null;
  laneId: string;
  optionalTools: string[];
  requiredTools: string[];
  summaryKey: string | null;
  supportLevel: "blocked" | "degraded" | "ready";
  warnings: string[];
};

type LaboratoryProfileReadiness = {
  blockers: string[];
  enabledLaneCount: number;
  enabledLaneIds: string[];
  lanes: LaboratoryProfileLaneSummary[];
  models: LaboratoryProfileModelSummaryRecord[];
  optionalTools: LaboratoryProfileToolSummaryRecord[];
  requiredTools: LaboratoryProfileToolSummaryRecord[];
  stageReady: boolean;
  target: LaboratoryResolvedProfileTarget;
  warnings: string[];
};

type LaboratoryProfileEstimate = {
  artifactCount: number;
  runtimeSeconds: number;
  sampleWindowSeconds: number | null;
};

type MediaProfileProjectionRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  buildDerivedTargetSignature: (output: LaboratoryNormalizedEditOutputRecord) => string | null;
  buildProfileModelSummary: (
    runtime: LaboratoryMediaProfileProjectionRuntime,
    project: LaboratoryProjectRecord
  ) => LaboratoryRecord[];
  buildProfileToolSummary: (
    runtime: LaboratoryMediaProfileProjectionRuntime,
    toolId: string,
    supportLevel: string
  ) => LaboratoryRecord;
  buildSourceTargetSignature: (project: LaboratoryProjectRecord) => string | null;
  clampProfileTranscriptSampleSeconds: (
    profileCapabilities: unknown,
    requestedSeconds: unknown
  ) => number;
  clone: (value: unknown) => unknown;
  createDefaultProfileState: (
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ) => unknown;
  createEmptyProfilePreflight: () => LaboratoryRecord;
  findEditOutputById: (project: LaboratoryProjectRecord, outputId: string | null) => unknown | null;
  findProfilePreset: (
    profilePresets: unknown,
    sourceKind: string,
    presetId: unknown
  ) => unknown | null;
  getCompatibleProfileLaneIds: (profilePresets: unknown, sourceKind: string) => string[];
  getDefaultProfileModelId: (profileModels: unknown, sourceKind: unknown) => string | null;
  getEnabledProfileLaneIds: (
    runtime: LaboratoryMediaProfileProjectionRuntime,
    project: LaboratoryProjectRecord
  ) => string[];
  getProfileDepthConfig: (
    runtime: LaboratoryMediaProfileProjectionRuntime,
    depth: unknown
  ) => LaboratoryRecord;
  getProfileFrameDensityRuntimeConfig: (
    runtime: LaboratoryMediaProfileProjectionRuntime,
    density: unknown
  ) => LaboratoryRecord;
  getProfileLaneMap: (profilePresets: unknown) => LaboratoryRecord;
  getProfileModelDescriptorMap: (
    runtime: LaboratoryMediaProfileProjectionRuntime
  ) => LaboratoryRecord;
  getStageSupport: (manifest: unknown, stageId: string) => string;
  getToolManifest: (runtime: LaboratoryMediaProfileProjectionRuntime, toolId: string) => unknown;
  normalizeEditOutput: (output: unknown) => LaboratoryNormalizedEditOutputRecord;
  normalizeProfileArtifactPreferences: (
    preferences: LaboratoryRecord,
    profileCapabilities: unknown,
    sourceKind: string
  ) => Record<string, boolean>;
  normalizeProfileState: (
    profile: unknown,
    profilePresets: unknown,
    profileModels: unknown,
    profileCapabilities: unknown,
    sourceKind: string
  ) => unknown;
  normalizeSourceMetadata: (value: unknown) => LaboratoryRecord;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaProfileProjectionRuntime(deps: MediaProfileProjectionRuntimeDeps) {
  const {
    asNonEmptyString,
    asNumber,
    buildDerivedTargetSignature,
    buildProfileModelSummary,
    buildProfileToolSummary,
    buildSourceTargetSignature,
    clampProfileTranscriptSampleSeconds,
    clone,
    createDefaultProfileState,
    createEmptyProfilePreflight,
    findEditOutputById,
    findProfilePreset,
    getCompatibleProfileLaneIds,
    getDefaultProfileModelId,
    getEnabledProfileLaneIds,
    getProfileDepthConfig,
    getProfileFrameDensityRuntimeConfig,
    getProfileLaneMap,
    getProfileModelDescriptorMap,
    getStageSupport,
    getToolManifest,
    normalizeEditOutput,
    normalizeProfileArtifactPreferences,
    normalizeProfileState,
    normalizeSourceMetadata,
    toRecord,
  } = deps;

  function toProjectProfileRecord(value: unknown): LaboratoryProjectProfileRecord {
    return toRecord(value);
  }

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toProfileLaneRecord(value: unknown): LaboratoryProfileLaneRecord {
    return toRecord(value);
  }

  function toProfileToolSummaryRecord(value: unknown): LaboratoryProfileToolSummaryRecord {
    return toRecord(value);
  }

  function toProfileModelSummaryRecord(value: unknown): LaboratoryProfileModelSummaryRecord {
    return toRecord(value);
  }

  function toProfilePreflightRecord(value: unknown): LaboratoryProfilePreflightRecord {
    return toRecord(value);
  }

  function toProfileTargetSummaryRecord(value: unknown): LaboratoryProfileTargetSummaryRecord {
    return toRecord(value);
  }

  function toNormalizedEditOutputRecord(value: unknown): LaboratoryNormalizedEditOutputRecord {
    return toRecord(value);
  }

  function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function (entry) {
        return asNonEmptyString(entry);
      })
      .filter((entry): entry is string => entry !== null);
  }

  function getProjectName(project: LaboratoryProjectRecord): string {
    return asNonEmptyString(project.name) || "--";
  }

  function getSourceKind(project: LaboratoryProjectRecord): string {
    return asNonEmptyString(toProjectSourceRecord(project.source).kind) || "video";
  }

  function getProfile(project: LaboratoryProjectRecord): LaboratoryProjectProfileRecord {
    return toProjectProfileRecord(project.profile);
  }

  function getSource(project: LaboratoryProjectRecord): LaboratoryProjectSourceRecord {
    return toProjectSourceRecord(project.source);
  }

  function resolveProfileTarget(project: LaboratoryProjectRecord): LaboratoryResolvedProfileTarget {
    const profile = getProfile(project);
    const source = getSource(project);
    const requestedMode: LaboratoryTargetMode =
      asNonEmptyString(profile.targetAssetMode) === "derived" ? "derived" : "source";
    const sourcePath = asNonEmptyString(source.storedPath);
    const sourceFileName = asNonEmptyString(source.storedFileName);
    const sourceMetadata = normalizeSourceMetadata(source.metadata);
    const sourceTarget: LaboratoryResolvedProfileTarget = {
      fileName: sourceFileName,
      label: sourceFileName || getProjectName(project),
      metadata: sourceMetadata,
      mimeType: asNonEmptyString(source.mimeType),
      mode: "source",
      outputId: null,
      path: sourcePath,
      reason: null,
      requestedMode,
      signature: sourcePath !== null ? buildSourceTargetSignature(project) : null,
      usingFallback: false,
    };

    if (requestedMode !== "derived") {
      return sourceTarget;
    }

    const outputId = asNonEmptyString(profile.targetOutputId);
    const pinnedOutput = findEditOutputById(project, outputId);
    const pinnedOutputRecord = toNormalizedEditOutputRecord(pinnedOutput);
    if (pinnedOutput !== null && asNonEmptyString(pinnedOutputRecord.path) !== null) {
      const output = toNormalizedEditOutputRecord(normalizeEditOutput(pinnedOutput));
      return {
        fileName: asNonEmptyString(output.fileName),
        label:
          asNonEmptyString(output.label) ||
          asNonEmptyString(output.fileName) ||
          asNonEmptyString(output.id) ||
          "--",
        metadata: normalizeSourceMetadata(output.metadata),
        mimeType: asNonEmptyString(output.mimeType),
        mode: "derived",
        outputId: asNonEmptyString(output.id),
        path: asNonEmptyString(output.path),
        reason: null,
        requestedMode,
        signature: buildDerivedTargetSignature(output),
        usingFallback: false,
      };
    }

    return {
      ...sourceTarget,
      outputId,
      reason:
        outputId === null
          ? "Choose a derived output to keep the profile target pinned."
          : "Pinned derived output is unavailable. Falling back to the saved source.",
      requestedMode,
      usingFallback: true,
    };
  }

  function buildProfileReadiness(
    runtime: LaboratoryMediaProfileProjectionRuntime,
    project: LaboratoryProjectRecord
  ): LaboratoryProfileReadiness {
    const sourceKind = getSourceKind(project);
    const profile = getProfile(project);
    const enabledLaneIds = getCompatibleProfileLaneIds(runtime.profilePresets, sourceKind).filter(
      function (laneId) {
        return toRecord(profile.laneSelection)[laneId] === true;
      }
    );
    const target = resolveProfileTarget(project);
    const laneMap = getProfileLaneMap(runtime.profilePresets);
    const requiredToolIds: string[] = [];
    const optionalToolIds: string[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];
    const requiredToolMap: Record<string, LaboratoryProfileToolSummaryRecord> = {};
    const optionalToolMap: Record<string, LaboratoryProfileToolSummaryRecord> = {};
    const modelSummaries = buildProfileModelSummary(runtime, project).map(
      toProfileModelSummaryRecord
    );
    const selectedModel =
      modelSummaries.find(function (entry) {
        return entry.selected === true;
      }) || null;

    if (target.path === null) {
      blockers.push("Prepare a source or derived output before building the profile.");
    }
    if (target.usingFallback === true && target.reason) {
      warnings.push(target.reason);
    }

    const laneSummaries = enabledLaneIds.map(function (laneId): LaboratoryProfileLaneSummary {
      const lane = toProfileLaneRecord(laneMap[laneId]);
      const laneRequired = toStringArray(lane.requiredTools);
      const laneOptional = toStringArray(lane.optionalTools);
      const laneWarnings: string[] = [];

      laneRequired.forEach(function (toolId) {
        if (!requiredToolIds.includes(toolId)) {
          requiredToolIds.push(toolId);
        }
        if (!requiredToolMap[toolId]) {
          requiredToolMap[toolId] = toProfileToolSummaryRecord(
            buildProfileToolSummary(
              runtime,
              toolId,
              getStageSupport(getToolManifest(runtime, toolId), "profile")
            )
          );
        }
      });

      laneOptional.forEach(function (toolId) {
        if (!optionalToolIds.includes(toolId)) {
          optionalToolIds.push(toolId);
        }
        if (!optionalToolMap[toolId]) {
          optionalToolMap[toolId] = toProfileToolSummaryRecord(
            buildProfileToolSummary(
              runtime,
              toolId,
              getStageSupport(getToolManifest(runtime, toolId), "profile")
            )
          );
        }
      });

      const missingRequired = laneRequired.filter(function (toolId) {
        const requiredSummary = requiredToolMap[toolId];
        return requiredSummary ? requiredSummary.ready !== true : true;
      });

      if (missingRequired.length > 0) {
        blockers.push(
          `${asNonEmptyString(lane.labelKey) || laneId} requires ${missingRequired
            .map(function (toolId) {
              const requiredSummary = requiredToolMap[toolId];
              return asNonEmptyString(requiredSummary?.displayName) || toolId;
            })
            .join(", ")}.`
        );
      }

      if (laneOptional.includes("transcript-runtime")) {
        const transcriptRuntimeSummary = optionalToolMap["transcript-runtime"] || null;
        if (!transcriptRuntimeSummary || transcriptRuntimeSummary.ready !== true) {
          laneWarnings.push(
            "Speech transcript sampling is unavailable until the central Speech Runtime is ready."
          );
        } else if (
          selectedModel &&
          selectedModel.runtimeCompatible === false &&
          asNonEmptyString(selectedModel.compatibilityReason)
        ) {
          laneWarnings.push(asNonEmptyString(selectedModel.compatibilityReason) || "");
        } else if (selectedModel === null || selectedModel.ready !== true) {
          laneWarnings.push(
            "Install and verify the active transcript model from Settings to unlock transcript sampling."
          );
        }
      }

      warnings.push(...laneWarnings);

      return {
        artifactKinds: toStringArray(lane.artifactKinds),
        labelKey: asNonEmptyString(lane.labelKey),
        laneId,
        optionalTools: laneOptional,
        requiredTools: laneRequired,
        summaryKey: asNonEmptyString(lane.summaryKey),
        supportLevel:
          missingRequired.length > 0 ? "blocked" : laneWarnings.length > 0 ? "degraded" : "ready",
        warnings: laneWarnings,
      };
    });

    return {
      blockers: Array.from(new Set(blockers)),
      enabledLaneCount: enabledLaneIds.length,
      enabledLaneIds,
      lanes: laneSummaries,
      models: modelSummaries,
      optionalTools: optionalToolIds
        .map(function (toolId) {
          return optionalToolMap[toolId];
        })
        .filter((entry): entry is LaboratoryProfileToolSummaryRecord => entry !== undefined),
      requiredTools: requiredToolIds
        .map(function (toolId) {
          return requiredToolMap[toolId];
        })
        .filter((entry): entry is LaboratoryProfileToolSummaryRecord => entry !== undefined),
      stageReady: blockers.length === 0,
      target: {
        ...target,
        metadata: toRecord(clone(target.metadata)),
      },
      warnings: Array.from(new Set(warnings)),
    };
  }

  function buildProfileEstimate(
    runtime: LaboratoryMediaProfileProjectionRuntime,
    project: LaboratoryProjectRecord,
    readiness: LaboratoryProfileReadiness
  ): LaboratoryProfileEstimate {
    const profile = getProfile(project);
    const sourceKind = getSourceKind(project);
    const depthConfig = getProfileDepthConfig(runtime, profile.depth);
    const frameDensityConfig = getProfileFrameDensityRuntimeConfig(
      runtime,
      profile.frameSampleDensity
    );
    const enabledLaneIds =
      readiness.enabledLaneIds.length > 0
        ? readiness.enabledLaneIds
        : getEnabledProfileLaneIds(runtime, project);
    const laneMap = getProfileLaneMap(runtime.profilePresets);
    const artifactBudget = Math.max(1, Math.round(asNumber(depthConfig["artifactBudget"]) || 3));
    const targetMetadata = toRecord(normalizeSourceMetadata(readiness.target.metadata));
    const durationSeconds = asNumber(targetMetadata["durationSeconds"]);
    const sampleWindowSeconds = Math.min(
      durationSeconds || Number.MAX_SAFE_INTEGER,
      Math.max(12, Math.round(asNumber(depthConfig["sampleWindowSeconds"]) || 60))
    );
    const transcriptSampleSeconds = clampProfileTranscriptSampleSeconds(
      runtime.profileCapabilities,
      profile.transcriptSampleSeconds
    );
    const artifactPreferences = normalizeProfileArtifactPreferences(
      toRecord(profile.artifactPreferences),
      runtime.profileCapabilities,
      sourceKind
    );
    const artifactKinds: string[] = [];

    enabledLaneIds.forEach(function (laneId) {
      const lane = toProfileLaneRecord(laneMap[laneId]);
      toStringArray(lane.artifactKinds).forEach(function (artifactKind) {
        if (artifactPreferences[artifactKind] !== true) {
          return;
        }
        if (!artifactKinds.includes(artifactKind)) {
          artifactKinds.push(artifactKind);
        }
      });
    });

    let runtimeSeconds =
      (sourceKind === "video" ? 18 : sourceKind === "audio" ? 14 : 10) +
      enabledLaneIds.length * 8 +
      (asNonEmptyString(profile.depth) === "deep"
        ? 28
        : asNonEmptyString(profile.depth) === "quick"
          ? 8
          : 16);

    runtimeSeconds +=
      Math.max(0, Math.round(asNumber(frameDensityConfig["tileCount"]) || 4) - 2) * 2;

    if (enabledLaneIds.includes("speech-overlay")) {
      const selectedModel =
        readiness.models.find(function (entry) {
          return entry.selected === true;
        }) || null;
      runtimeSeconds +=
        artifactPreferences["transcript"] === true
          ? selectedModel && selectedModel.ready === true
            ? Math.max(8, Math.round(transcriptSampleSeconds / 3))
            : 5
          : 0;
    }

    return {
      artifactCount: Math.min(artifactBudget, artifactKinds.length),
      runtimeSeconds,
      sampleWindowSeconds: Number.isFinite(sampleWindowSeconds) ? sampleWindowSeconds : null,
    };
  }

  function syncProjectProfileProjection(
    runtime: LaboratoryMediaProfileProjectionRuntime,
    project: LaboratoryProjectRecord
  ) {
    const sourceKind = getSourceKind(project);
    const defaults = toProjectProfileRecord(
      createDefaultProfileState(
        runtime.profilePresets,
        runtime.profileModels,
        runtime.profileCapabilities,
        sourceKind
      )
    );
    const profile = toProjectProfileRecord(
      normalizeProfileState(
        project.profile,
        runtime.profilePresets,
        runtime.profileModels,
        runtime.profileCapabilities,
        sourceKind
      )
    );
    const compatibleLaneIds = getCompatibleProfileLaneIds(runtime.profilePresets, sourceKind);
    const laneSelection: Record<string, boolean> = {};

    compatibleLaneIds.forEach(function (laneId) {
      laneSelection[laneId] = toRecord(profile.laneSelection)[laneId] === true;
    });

    if (
      compatibleLaneIds.length > 0 &&
      compatibleLaneIds.every(function (laneId) {
        return laneSelection[laneId] !== true;
      })
    ) {
      compatibleLaneIds.forEach(function (laneId) {
        laneSelection[laneId] = toRecord(defaults.laneSelection)[laneId] === true;
      });
    }

    const requestedTargetMode: LaboratoryTargetMode =
      asNonEmptyString(profile.targetAssetMode) === "derived" ? "derived" : "source";
    const requestedModelId = asNonEmptyString(profile.modelId);
    const requestedModelDescriptor =
      requestedModelId !== null
        ? toRecord(getProfileModelDescriptorMap(runtime)[requestedModelId])
        : {};
    const requestedModelKinds = toStringArray(requestedModelDescriptor["mediaKinds"]);
    const fallbackModelId = getDefaultProfileModelId(runtime.profileModels, sourceKind);
    const resolvedProfile: LaboratoryProjectProfileRecord = {
      ...profile,
      activePresetId:
        findProfilePreset(runtime.profilePresets, sourceKind, profile.activePresetId) !== null
          ? profile.activePresetId
          : defaults.activePresetId,
      laneSelection,
      modelId:
        requestedModelId &&
        (requestedModelKinds.length === 0 || requestedModelKinds.includes(sourceKind))
          ? requestedModelId
          : fallbackModelId,
      targetAssetMode: requestedTargetMode,
      targetOutputId:
        requestedTargetMode === "derived" ? asNonEmptyString(profile.targetOutputId) : null,
    };

    const target = resolveProfileTarget({
      ...project,
      profile: resolvedProfile,
    });
    const existingPreflight = toProfilePreflightRecord({
      ...createEmptyProfilePreflight(),
      ...toRecord(resolvedProfile.preflight),
    });
    const previousTargetSummary = toProfileTargetSummaryRecord(existingPreflight.targetSummary);
    const previousSignature = asNonEmptyString(previousTargetSummary.signature);
    const nextSignature = asNonEmptyString(target.signature);
    const signatureChanged = previousSignature !== nextSignature;

    if (existingPreflight.status !== "running") {
      existingPreflight.targetSummary =
        nextSignature === null
          ? null
          : {
              fileName: target.fileName,
              label: target.label,
              mimeType: target.mimeType,
              mode: target.mode,
              outputId: target.outputId,
              path: target.path,
              requestedMode: target.requestedMode,
              signature: nextSignature,
            };
      existingPreflight.warnings = Array.from(
        new Set(
          toStringArray(existingPreflight.warnings).concat(target.reason ? [target.reason] : [])
        )
      );
      if (signatureChanged === true) {
        existingPreflight.status =
          asNonEmptyString(existingPreflight.ranAt) !== null ? "stale" : "idle";
        existingPreflight.jobId = null;
        existingPreflight.requestId = null;
        existingPreflight.error = null;
      }
    }

    resolvedProfile["targetAssetSignature"] = nextSignature;
    resolvedProfile.preflight = existingPreflight;
    resolvedProfile["readiness"] = buildProfileReadiness(runtime, {
      ...project,
      profile: resolvedProfile,
    });
    resolvedProfile["estimate"] = buildProfileEstimate(
      runtime,
      {
        ...project,
        profile: resolvedProfile,
      },
      resolvedProfile["readiness"] as LaboratoryProfileReadiness
    );
    resolvedProfile.dirty =
      resolvedProfile.dirty === true ||
      signatureChanged === true ||
      asNonEmptyString(toProfilePreflightRecord(resolvedProfile["preflight"]).status) !== "ready";

    project.profile = resolvedProfile;
    return project;
  }

  return {
    buildProfileEstimate,
    buildProfileReadiness,
    resolveProfileTarget,
    syncProjectProfileProjection,
  };
}
