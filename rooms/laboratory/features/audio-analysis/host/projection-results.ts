interface ProjectionResultsRecord extends Record<string, unknown> {
  status?: unknown;
  summary?: unknown;
  blockers?: unknown;
  metadata?: unknown;
  descriptorSummary?: unknown;
  prosodySummary?: unknown;
  emotionHeuristic?: unknown;
  topClasses?: unknown;
  stemCount?: unknown;
  modelName?: unknown;
  musicSummary?: unknown;
  diarizationSummary?: unknown;
  centroid?: unknown;
  rolloff?: unknown;
  flatness?: unknown;
  mean?: unknown;
  meanF0Hz?: unknown;
  voicedRatio?: unknown;
  estimatedPauseCount?: unknown;
  label?: unknown;
  className?: unknown;
  tempoBpm?: unknown;
  dominantPitchClass?: unknown;
  speakerCount?: unknown;
  segmentCount?: unknown;
  titleKey?: unknown;
  summaryKey?: unknown;
  warnings?: unknown;
  signals?: unknown;
  artifacts?: unknown;
  confidence?: unknown;
  id?: unknown;
  value?: unknown;
}

interface ProjectionResultsDeps {
  asNonEmptyString: (value: unknown) => string | null;
  normalizeAudioAnalysisMetric: (rawValue: unknown) => ProjectionResultsRecord;
  normalizeStringArray: (value: unknown) => string[];
  toRecord: (value: unknown) => ProjectionResultsRecord;
}

export function createAudioAnalysisProjectionResultsRuntime(deps: ProjectionResultsDeps) {
  const { asNonEmptyString, normalizeAudioAnalysisMetric, normalizeStringArray, toRecord } = deps;

  function getAudioAnalysisConfidenceRank(confidence: unknown): number {
    const nextConfidence = asNonEmptyString(confidence) || "low";
    return nextConfidence === "high" ? 3 : nextConfidence === "medium" ? 2 : 1;
  }

  function mapAudioAnalysisResultStatus(
    processRecord: unknown,
    moduleEntry: unknown,
    capabilityEntry: unknown
  ): string {
    const processStatus = asNonEmptyString(toRecord(processRecord).status) || "idle";
    const moduleStatus = asNonEmptyString(toRecord(moduleEntry).status) || "idle";
    const capabilityStatus = asNonEmptyString(toRecord(capabilityEntry).status) || "planned";

    if (moduleStatus === "ready") {
      return processStatus === "stale" ? "stale" : "complete";
    }
    if (moduleStatus === "error" || moduleStatus === "failed") {
      return "failed";
    }
    if (moduleStatus === "cancelled") {
      return "cancelled";
    }
    if (["planned", "gated", "blocked", "skipped", "running", "queued"].includes(moduleStatus)) {
      return moduleStatus;
    }
    if (processStatus === "stale" && capabilityStatus === "ready") {
      return "stale";
    }
    return capabilityStatus === "ready" ? "idle" : capabilityStatus;
  }

  function buildAudioAnalysisModuleMetrics(
    signals: unknown[],
    artifacts: unknown[]
  ): ProjectionResultsRecord[] {
    const metrics: { id: string; label: string; value: string }[] = [
      {
        id: "signals",
        label: "Signals",
        value: String(signals.length),
      },
      {
        id: "artifacts",
        label: "Artifacts",
        value: String(artifacts.length),
      },
    ];
    const descriptorSummary =
      artifacts
        .map(function (artifact: unknown) {
          return toRecord(toRecord(artifact).metadata).descriptorSummary;
        })
        .find(function (entry: unknown) {
          return Object.keys(toRecord(entry)).length > 0;
        }) || {};
    const prosodySummary =
      artifacts
        .map(function (artifact: unknown) {
          return toRecord(toRecord(artifact).metadata).prosodySummary;
        })
        .find(function (entry: unknown) {
          return Object.keys(toRecord(entry)).length > 0;
        }) || {};
    const emotionHeuristic =
      artifacts
        .map(function (artifact: unknown) {
          return toRecord(toRecord(artifact).metadata).emotionHeuristic;
        })
        .find(function (entry: unknown) {
          return Object.keys(toRecord(entry)).length > 0;
        }) || {};
    const soundEventSummary =
      artifacts
        .map(function (artifact: unknown) {
          return toRecord(toRecord(artifact).metadata).topClasses;
        })
        .find(function (entry: unknown) {
          return Array.isArray(entry) && entry.length > 0;
        }) || [];
    const sourceSeparationSummary =
      artifacts
        .map(function (artifact: unknown) {
          return toRecord(toRecord(artifact).metadata);
        })
        .find(function (entry: ProjectionResultsRecord) {
          return typeof toRecord(entry).stemCount === "number";
        }) || {};
    const musicAnalysisSummary =
      artifacts
        .map(function (artifact: unknown) {
          return toRecord(toRecord(artifact).metadata).musicSummary;
        })
        .find(function (entry: unknown) {
          return Object.keys(toRecord(entry)).length > 0;
        }) || {};
    const diarizationSummary =
      artifacts
        .map(function (artifact: unknown) {
          return toRecord(toRecord(artifact).metadata).diarizationSummary;
        })
        .find(function (entry: unknown) {
          return Object.keys(toRecord(entry)).length > 0;
        }) || {};

    const desc = descriptorSummary as ProjectionResultsRecord;
    if (typeof toRecord(desc.centroid).mean === "number") {
      metrics.push({
        id: "spectral-centroid",
        label: "Mean centroid",
        value: `${Number(toRecord(desc.centroid).mean).toFixed(1)} Hz`,
      });
    }
    if (typeof toRecord(desc.rolloff).mean === "number") {
      metrics.push({
        id: "spectral-rolloff",
        label: "Mean rolloff",
        value: `${Number(toRecord(desc.rolloff).mean).toFixed(1)} Hz`,
      });
    }
    if (typeof toRecord(desc.flatness).mean === "number") {
      metrics.push({
        id: "spectral-flatness",
        label: "Flatness",
        value: Number(toRecord(desc.flatness).mean).toFixed(3),
      });
    }
    const prosody = prosodySummary as ProjectionResultsRecord;
    if (typeof prosody.meanF0Hz === "number") {
      metrics.push({
        id: "prosody-f0",
        label: "Mean F0",
        value: `${Number(prosody.meanF0Hz).toFixed(1)} Hz`,
      });
    }
    if (typeof prosody.voicedRatio === "number") {
      metrics.push({
        id: "prosody-voiced-ratio",
        label: "Voiced ratio",
        value: `${Math.round(Number(prosody.voicedRatio) * 100)}%`,
      });
    }
    if (typeof prosody.estimatedPauseCount === "number") {
      metrics.push({
        id: "prosody-pauses",
        label: "Estimated pauses",
        value: String(prosody.estimatedPauseCount),
      });
    }
    const emotion = emotionHeuristic as ProjectionResultsRecord;
    if (typeof emotion.label === "string" && emotion.label.trim() !== "") {
      metrics.push({
        id: "emotion-label",
        label: "Heuristic label",
        value: emotion.label,
      });
    }
    if (Array.isArray(soundEventSummary) && soundEventSummary.length > 0) {
      const topClass = toRecord(soundEventSummary[0]);
      metrics.push({
        id: "sound-event-top",
        label: "Top event",
        value:
          typeof topClass.label === "string" && topClass.label.trim() !== ""
            ? topClass.label
            : typeof topClass.className === "string" && topClass.className.trim() !== ""
              ? topClass.className
              : "Unknown",
      });
    }
    const separation = sourceSeparationSummary;
    if (typeof separation.stemCount === "number") {
      metrics.push({
        id: "source-separation-stems",
        label: "Separated stems",
        value: String(separation.stemCount),
      });
    }
    if (typeof separation.modelName === "string" && separation.modelName.trim() !== "") {
      metrics.push({
        id: "source-separation-model",
        label: "Separation model",
        value: separation.modelName,
      });
    }
    const music = musicAnalysisSummary as ProjectionResultsRecord;
    if (typeof music.tempoBpm === "number") {
      metrics.push({
        id: "music-tempo",
        label: "Tempo",
        value: `${Number(music.tempoBpm).toFixed(1)} BPM`,
      });
    }
    if (typeof music.dominantPitchClass === "string" && music.dominantPitchClass.trim() !== "") {
      metrics.push({
        id: "music-pitch-class",
        label: "Dominant pitch class",
        value: music.dominantPitchClass,
      });
    }
    const diarization = diarizationSummary as ProjectionResultsRecord;
    if (typeof diarization.speakerCount === "number") {
      metrics.push({
        id: "speaker-count",
        label: "Speakers",
        value: String(diarization.speakerCount),
      });
    }
    if (typeof diarization.segmentCount === "number") {
      metrics.push({
        id: "speaker-segments",
        label: "Speaker segments",
        value: String(diarization.segmentCount),
      });
    }

    return metrics.map(normalizeAudioAnalysisMetric);
  }

  function buildAudioAnalysisModuleSummary(
    resultStatus: string,
    moduleEntry: unknown,
    capabilityEntry: unknown
  ): string {
    const summary = asNonEmptyString(toRecord(moduleEntry).summary);
    if (summary !== null) {
      return summary;
    }
    const blockers = normalizeStringArray(toRecord(capabilityEntry).blockers);
    if (blockers.length > 0) {
      return blockers[0] || "Blocked by a runtime dependency.";
    }
    switch (resultStatus) {
      case "planned":
        return "Reserved for the later rollout.";
      case "gated":
        return "This module remains capability-gated on the current runtime.";
      case "blocked":
        return "Resolve the module blockers before running the audio desk.";
      case "stale":
        return "The target changed after the last completed run.";
      case "complete":
        return "This module completed during the latest managed run.";
      case "running":
        return "This module is currently running.";
      default:
        return "";
    }
  }

  return {
    buildAudioAnalysisModuleMetrics,
    buildAudioAnalysisModuleSummary,
    getAudioAnalysisConfidenceRank,
    mapAudioAnalysisResultStatus,
  };
}
