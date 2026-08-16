type LaboratoryRecord = Record<string, unknown>;

type LaboratoryMediaProfilePreflightRuntime = LaboratoryRecord & {
  profileCapabilities?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  id?: unknown;
  profile?: unknown;
  slug?: unknown;
  source?: unknown;
};

type LaboratoryProjectProfileRecord = LaboratoryRecord & {
  activePresetId?: unknown;
  artifactPreferences?: unknown;
  artifacts?: unknown;
  dirty?: unknown;
  estimate?: unknown;
  frameSampleDensity?: unknown;
  lastActionAt?: unknown;
  lastError?: unknown;
  preflight?: unknown;
  readiness?: unknown;
  sensitivity?: unknown;
  signals?: unknown;
  transcriptSampleSeconds?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  kind?: unknown;
};

type LaboratoryProfileReadinessRecord = LaboratoryRecord & {
  blockers?: unknown;
  enabledLaneIds?: unknown;
  stageReady?: unknown;
  target?: unknown;
  warnings?: unknown;
};

type LaboratoryProfileTargetRecord = LaboratoryRecord & {
  fileName?: unknown;
  label?: unknown;
  metadata?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  outputId?: unknown;
  path?: unknown;
  requestedMode?: unknown;
  signature?: unknown;
};

type LaboratoryProfileEstimateRecord = LaboratoryRecord & {
  sampleWindowSeconds?: unknown;
};

type LaboratoryFrameDensityConfigRecord = LaboratoryRecord & {
  tileCount?: unknown;
};

type LaboratoryArtifactRecord = LaboratoryRecord & {
  id?: unknown;
};

type LaboratorySignalRecord = LaboratoryRecord & {
  laneId?: unknown;
};

type LaboratoryVideoProbeRecord = LaboratoryRecord & {
  black?: unknown;
  freeze?: unknown;
};

type LaboratoryVideoProbeBucketRecord = LaboratoryRecord & {
  count?: unknown;
};

type LaboratoryAudioProbeRecord = LaboratoryRecord & {
  silence?: unknown;
  volume?: unknown;
};

type LaboratoryAudioProbeBucketRecord = LaboratoryRecord & {
  count?: unknown;
};

type LaboratoryAudioVolumeRecord = LaboratoryRecord & {
  maxVolumeDb?: unknown;
  meanVolumeDb?: unknown;
};

type LaboratoryTranscriptResultRecord = LaboratoryRecord & {
  artifact?: unknown;
  text?: unknown;
};

type LaboratoryProfileArtifactPreferences = Record<string, boolean>;

type LaboratoryProfilePreflightDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  buildSyntheticProfileSignal: (
    signals: LaboratorySignalRecord[],
    sensitivity: number,
    artifactIds: string[]
  ) => unknown | null;
  clampNumber: (value: unknown, min: number, max: number, fallback: number) => number;
  clampProfileTranscriptSampleSeconds: (profileCapabilities: unknown, value: unknown) => number;
  clearJob: (runtime: LaboratoryMediaProfilePreflightRuntime, jobId: string) => void;
  clone: (value: unknown) => unknown;
  createEmptyProfilePreflight: () => LaboratoryRecord;
  createProfileSignal: (
    laneId: string,
    kind: string,
    confidence: string,
    level: string,
    title: string,
    detail: string,
    evidenceCount: number,
    artifactIds: string[]
  ) => LaboratorySignalRecord;
  ensureProfileJobSlotAvailable: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    projectId: string,
    action: string
  ) => void;
  ensureProfileToolReady: (runtime: LaboratoryMediaProfilePreflightRuntime) => void;
  ensureProjectDirectories: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord,
    requestId: unknown
  ) => Promise<unknown>;
  generateProfileFrameStrip: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProfileTargetRecord,
    artifactBase: string,
    sampleWindowSeconds: number,
    frameTileCount: number
  ) => Promise<unknown>;
  generateProfileMetadataArtifact: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord,
    target: LaboratoryProfileTargetRecord,
    artifactBase: string
  ) => Promise<unknown>;
  generateProfileSpectrogram: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProfileTargetRecord,
    artifactBase: string
  ) => Promise<unknown>;
  getActiveProject: (
    runtime: LaboratoryMediaProfilePreflightRuntime
  ) => LaboratoryProjectRecord | null;
  getProfileFrameDensityRuntimeConfig: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    density: unknown
  ) => unknown;
  maybeRunTranscriptProfileSample: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProfileTargetRecord,
    artifactBase: string,
    transcriptSampleSeconds: number
  ) => Promise<unknown>;
  normalizeProfileArtifactPreferences: (
    prefs: LaboratoryRecord,
    capabilities: unknown,
    sourceKind: string
  ) => LaboratoryProfileArtifactPreferences;
  normalizeSourceMetadata: (value: unknown) => LaboratoryRecord | null;
  patchActiveProject: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    updater: (project: LaboratoryProjectRecord) => LaboratoryProjectRecord
  ) => Promise<unknown>;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  registerJob: (runtime: LaboratoryMediaProfilePreflightRuntime, payload: LaboratoryRecord) => void;
  runAudioStructureProbe: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProfileTargetRecord,
    options?: LaboratoryRecord
  ) => Promise<unknown>;
  runVideoStructureProbe: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProfileTargetRecord,
    options?: LaboratoryRecord
  ) => Promise<unknown>;
  sanitizeFileSegment: (value: string, fallback: string) => string;
  syncProjectFeatureProjections: (
    runtime: LaboratoryMediaProfilePreflightRuntime,
    project: LaboratoryProjectRecord
  ) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaProfilePreflightRuntime(deps: LaboratoryProfilePreflightDeps) {
  const {
    asNonEmptyString,
    asNumber,
    buildSyntheticProfileSignal,
    clampNumber,
    clampProfileTranscriptSampleSeconds,
    clearJob,
    clone,
    createEmptyProfilePreflight,
    createProfileSignal,
    ensureProfileJobSlotAvailable,
    ensureProfileToolReady,
    ensureProjectDirectories,
    generateProfileFrameStrip,
    generateProfileMetadataArtifact,
    generateProfileSpectrogram,
    getActiveProject,
    getProfileFrameDensityRuntimeConfig,
    maybeRunTranscriptProfileSample,
    normalizeProfileArtifactPreferences,
    normalizeSourceMetadata,
    patchActiveProject,
    pushJobState,
    registerJob,
    runAudioStructureProbe,
    runVideoStructureProbe,
    sanitizeFileSegment,
    syncProjectFeatureProjections,
    toRecord,
  } = deps;

  function toProjectRecord(value: unknown): LaboratoryProjectRecord {
    return toRecord(value);
  }

  function toProjectProfileRecord(value: unknown): LaboratoryProjectProfileRecord {
    return toRecord(value);
  }

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toProfileReadinessRecord(value: unknown): LaboratoryProfileReadinessRecord {
    return toRecord(value);
  }

  function toProfileTargetRecord(value: unknown): LaboratoryProfileTargetRecord {
    return toRecord(value);
  }

  function toProfileEstimateRecord(value: unknown): LaboratoryProfileEstimateRecord {
    return toRecord(value);
  }

  function toFrameDensityConfigRecord(value: unknown): LaboratoryFrameDensityConfigRecord {
    return toRecord(value);
  }

  function toArtifactRecord(value: unknown): LaboratoryArtifactRecord {
    return toRecord(value);
  }

  function toSignalRecord(value: unknown): LaboratorySignalRecord {
    return toRecord(value);
  }

  function toVideoProbeRecord(value: unknown): LaboratoryVideoProbeRecord {
    return toRecord(value);
  }

  function toVideoProbeBucketRecord(value: unknown): LaboratoryVideoProbeBucketRecord {
    return toRecord(value);
  }

  function toAudioProbeRecord(value: unknown): LaboratoryAudioProbeRecord {
    return toRecord(value);
  }

  function toAudioProbeBucketRecord(value: unknown): LaboratoryAudioProbeBucketRecord {
    return toRecord(value);
  }

  function toAudioVolumeRecord(value: unknown): LaboratoryAudioVolumeRecord {
    return toRecord(value);
  }

  function toTranscriptResultRecord(value: unknown): LaboratoryTranscriptResultRecord {
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

  function getProjectId(project: LaboratoryProjectRecord): string {
    return asNonEmptyString(project.id) || "unknown-project";
  }

  function getProjectProfile(project: LaboratoryProjectRecord): LaboratoryProjectProfileRecord {
    return toProjectProfileRecord(project.profile);
  }

  function getSourceKind(project: LaboratoryProjectRecord): string {
    return asNonEmptyString(toProjectSourceRecord(project.source).kind) || "video";
  }

  function getArtifactIds(artifacts: LaboratoryArtifactRecord[]): string[] {
    return artifacts
      .map(function (artifact) {
        return asNonEmptyString(artifact.id);
      })
      .filter((artifactId): artifactId is string => artifactId !== null);
  }

  async function runProfilePreflight(
    api: unknown,
    runtime: LaboratoryMediaProfilePreflightRuntime,
    requestId: string,
    actionPayload: unknown = {}
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    ensureProfileToolReady(runtime);
    const projectId = getProjectId(project);
    ensureProfileJobSlotAvailable(runtime, projectId, "profile-run-preflight");
    await ensureProjectDirectories(runtime, project, requestId);

    const projectedProject = toProjectRecord(clone(project));
    syncProjectFeatureProjections(runtime, projectedProject);
    const projectedProfile = getProjectProfile(projectedProject);
    const readiness = toProfileReadinessRecord(projectedProfile.readiness);
    const blockers = toStringArray(readiness.blockers);
    if (readiness.stageReady !== true) {
      throw new Error(blockers[0] || "Resolve the profile blockers before running preflight.");
    }

    const target = toProfileTargetRecord(readiness.target);
    const artifactBase = sanitizeFileSegment(
      `${asNonEmptyString(project.slug) || "project"}-${
        asNonEmptyString(projectedProfile.activePresetId) || "profile"
      }-${Date.now()}`,
      "profile-pass"
    );
    const jobId = `room-profile-preflight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sampleWindowSeconds =
      asNumber(toProfileEstimateRecord(projectedProfile.estimate).sampleWindowSeconds) || 45;
    const sourceKind = getSourceKind(project);
    const artifactPreferences = normalizeProfileArtifactPreferences(
      toRecord(projectedProfile.artifactPreferences),
      runtime.profileCapabilities,
      sourceKind
    );
    const frameDensityConfig = toFrameDensityConfigRecord(
      getProfileFrameDensityRuntimeConfig(runtime, projectedProfile.frameSampleDensity)
    );
    const frameTileCount = Math.max(2, Math.round(asNumber(frameDensityConfig.tileCount) || 4));
    const transcriptSampleSeconds = clampProfileTranscriptSampleSeconds(
      runtime.profileCapabilities,
      projectedProfile.transcriptSampleSeconds
    );
    const payloadRecord = toRecord(actionPayload);
    const analysisScope =
      payloadRecord["analysisScope"] === undefined
        ? toRecord(toRecord(projectedProject["workbench"])["analysisScope"])
        : payloadRecord["analysisScope"];
    const probeOptions = {
      analysisScope,
      fallbackWindowSeconds: sampleWindowSeconds,
    };

    registerJob(runtime, {
      action: "profile-run-preflight",
      featureStage: "profile",
      jobId: jobId,
      projectId: projectId,
      requestId: requestId,
      toolId: "ffmpeg",
    });
    pushJobState(api, {
      action: "profile-run-preflight",
      featureStage: "profile",
      jobId: jobId,
      projectId: projectId,
      requestId: requestId,
      stage: "queued",
      toolId: "ffmpeg",
    });

    await patchActiveProject(runtime, function (nextProject) {
      const nextProfile = getProjectProfile(nextProject);
      nextProject.profile = nextProfile;
      nextProfile.lastError = null;
      nextProfile.lastActionAt = new Date().toISOString();
      nextProfile.preflight = {
        ...createEmptyProfilePreflight(),
        ...toRecord(nextProfile.preflight),
        error: null,
        jobId: jobId,
        requestId: requestId,
        status: "running",
        warnings: toStringArray(readiness.warnings),
      };
      return nextProject;
    });

    try {
      const artifacts: LaboratoryArtifactRecord[] = [];
      const signals: LaboratorySignalRecord[] = [];
      const metadataArtifact = artifactPreferences["metadata"]
        ? await generateProfileMetadataArtifact(runtime, project, target, artifactBase)
        : null;
      if (metadataArtifact) {
        artifacts.push(toArtifactRecord(metadataArtifact));
      }

      if (
        artifactPreferences["frame-strip"] === true &&
        (sourceKind === "video" || sourceKind === "image")
      ) {
        try {
          const frameArtifact = await generateProfileFrameStrip(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            sampleWindowSeconds,
            frameTileCount
          );
          if (frameArtifact) {
            artifacts.push(toArtifactRecord(frameArtifact));
          }
        } catch (_error) {
          // Optional artifact.
        }
      }

      if (
        artifactPreferences["spectrogram"] === true &&
        (sourceKind === "video" || sourceKind === "audio")
      ) {
        try {
          const spectrogramArtifact = await generateProfileSpectrogram(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase
          );
          if (spectrogramArtifact) {
            artifacts.push(toArtifactRecord(spectrogramArtifact));
          }
        } catch (_error) {
          // Optional artifact.
        }
      }

      const artifactIds = getArtifactIds(artifacts);
      const metadata = normalizeSourceMetadata(target["metadata"]);
      const enabledLaneIds = toStringArray(readiness.enabledLaneIds);

      if (
        enabledLaneIds.includes("metadata-lineage") &&
        (!metadata || asNonEmptyString(toRecord(metadata)["formatName"]) === null)
      ) {
        signals.push(
          createProfileSignal(
            "metadata-lineage",
            "measured",
            "medium",
            "medium",
            "Metadata lineage is incomplete",
            "The sampled asset is missing a clear container or format declaration from ffprobe.",
            1,
            artifactIds
          )
        );
      }

      if (sourceKind === "video" && enabledLaneIds.includes("visual-tamper")) {
        const videoProbe = toVideoProbeRecord(
          await runVideoStructureProbe(runtime, project, requestId, jobId, target, probeOptions)
        );
        const freezeBucket = toVideoProbeBucketRecord(videoProbe.freeze);
        const blackBucket = toVideoProbeBucketRecord(videoProbe.black);
        const freezeCount = asNumber(freezeBucket.count) || 0;
        const blackCount = asNumber(blackBucket.count) || 0;
        if (freezeCount > 0) {
          signals.push(
            createProfileSignal(
              "visual-tamper",
              "measured",
              freezeCount > 2 ? "high" : "medium",
              "medium",
              "Freeze intervals detected",
              `The sampled window contains ${freezeCount} freeze interval(s).`,
              freezeCount,
              artifactIds
            )
          );
        }
        if (blackCount > 0) {
          signals.push(
            createProfileSignal(
              "visual-tamper",
              "measured",
              "low",
              "low",
              "Black interval transitions detected",
              `Black interval analysis found ${blackCount} transition(s).`,
              blackCount,
              artifactIds
            )
          );
        }
      }

      if (
        (sourceKind === "video" || sourceKind === "audio") &&
        (enabledLaneIds.includes("audio-tamper") || enabledLaneIds.includes("speech-overlay"))
      ) {
        const audioProbe = toAudioProbeRecord(
          await runAudioStructureProbe(runtime, project, requestId, jobId, target, probeOptions)
        );
        const silenceBucket = toAudioProbeBucketRecord(audioProbe.silence);
        const volume = toAudioVolumeRecord(audioProbe.volume);
        const silenceCount = asNumber(silenceBucket.count) || 0;
        const meanVolumeDb = asNumber(volume.meanVolumeDb);
        const maxVolumeDb = asNumber(volume.maxVolumeDb);
        if (silenceCount > 0) {
          signals.push(
            createProfileSignal(
              "audio-tamper",
              "measured",
              silenceCount > 3 ? "medium" : "low",
              "medium",
              "Silence pockets detected",
              `Silence detection found ${silenceCount} pocket(s) in the sampled audio path.`,
              silenceCount,
              artifactIds
            )
          );
        }
        if (
          typeof meanVolumeDb === "number" &&
          typeof maxVolumeDb === "number" &&
          maxVolumeDb - meanVolumeDb > 18
        ) {
          signals.push(
            createProfileSignal(
              "audio-tamper",
              "heuristic",
              "low",
              "low",
              "Wide loudness spread observed",
              "The sampled loudness spread is wider than a typical continuous dialogue pass.",
              1,
              artifactIds
            )
          );
        }

        try {
          const transcriptResult = artifactPreferences["transcript"]
            ? toTranscriptResultRecord(
                await maybeRunTranscriptProfileSample(
                  runtime,
                  project,
                  requestId,
                  jobId,
                  target,
                  artifactBase,
                  transcriptSampleSeconds
                )
              )
            : null;
          const transcriptArtifact =
            transcriptResult !== null ? toArtifactRecord(transcriptResult.artifact) : null;
          if (transcriptResult && transcriptArtifact && asNonEmptyString(transcriptArtifact.id)) {
            artifacts.push(transcriptArtifact);
            artifactIds.push(asNonEmptyString(transcriptArtifact.id) || "");
            const transcriptText = asNonEmptyString(transcriptResult.text) || "";
            signals.push(
              createProfileSignal(
                "speech-overlay",
                "measured",
                "low",
                "medium",
                "Transcript sample captured",
                `Transcript sample returned ${
                  transcriptText.split(/\s+/).filter(Boolean).length
                } words from the sampled audio window.`,
                1,
                [asNonEmptyString(transcriptArtifact.id) || ""]
              )
            );
          }
        } catch (_error) {
          // Transcript sampling stays optional in MVP.
        }
      }

      const syntheticSignal = buildSyntheticProfileSignal(
        signals.filter(function (entry) {
          return asNonEmptyString(toSignalRecord(entry).laneId) !== "speech-overlay";
        }),
        clampNumber(projectedProfile.sensitivity, 0.1, 1, 0.58),
        artifactIds
      );
      if (syntheticSignal) {
        signals.push(toSignalRecord(syntheticSignal));
      }

      const completedAt = new Date().toISOString();
      await patchActiveProject(runtime, function (nextProject) {
        const nextProfile = getProjectProfile(nextProject);
        nextProject.profile = nextProfile;
        nextProfile.dirty = false;
        nextProfile.lastError = null;
        nextProfile.lastActionAt = completedAt;
        nextProfile.signals = signals;
        nextProfile.artifacts = artifacts;
        nextProfile.preflight = {
          error: null,
          jobId: jobId,
          ranAt: completedAt,
          requestId: requestId,
          status: "ready",
          targetSummary: {
            fileName: asNonEmptyString(target.fileName),
            label: asNonEmptyString(target.label),
            mimeType: asNonEmptyString(target.mimeType),
            mode: asNonEmptyString(target.mode),
            outputId: asNonEmptyString(target.outputId),
            path: asNonEmptyString(target.path),
            requestedMode: asNonEmptyString(target.requestedMode),
            signature: asNonEmptyString(target.signature),
          },
          warnings: toStringArray(readiness.warnings),
        };
        return nextProject;
      });

      pushJobState(api, {
        action: "profile-run-preflight",
        featureStage: "profile",
        jobId: jobId,
        percent: 100,
        projectId: projectId,
        requestId: requestId,
        stage: "completed",
        toolId: "ffmpeg",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await patchActiveProject(runtime, function (nextProject) {
        const nextProfile = getProjectProfile(nextProject);
        nextProject.profile = nextProfile;
        nextProfile.lastError = errorMessage;
        nextProfile.lastActionAt = new Date().toISOString();
        nextProfile.preflight = {
          ...createEmptyProfilePreflight(),
          ...toRecord(nextProfile.preflight),
          error: errorMessage,
          jobId: jobId,
          requestId: requestId,
          status: "error",
        };
        return nextProject;
      });
      pushJobState(api, {
        action: "profile-run-preflight",
        featureStage: "profile",
        jobId: jobId,
        message: errorMessage,
        projectId: projectId,
        requestId: requestId,
        stage: "failed",
        toolId: "ffmpeg",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  return {
    runProfilePreflight,
  };
}
