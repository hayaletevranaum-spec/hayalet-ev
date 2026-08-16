import { normalizeLabAnalysisModuleSettings } from "../../../domain/lab-types.js";
import type { LabSettingsRecord } from "../../../domain/lab-types.js";
import { readNumberSetting, readStringSetting } from "../../../shared/host/settings-readers.js";
import { createAudioAnalysisRecoveryProcessRunners } from "./process-local-recovery-runners.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryAudioProcessRuntime = LaboratoryRecord;

type LaboratoryProjectRecord = LaboratoryRecord;

type LaboratoryAudioTargetRecord = LaboratoryRecord;

type LaboratorySpeechAvailabilityRecord = LaboratoryRecord & {
  ready?: unknown;
};

type LaboratoryAudioProbeBucketRecord = LaboratoryRecord & {
  count?: unknown;
};

type LaboratoryAudioVolumeRecord = LaboratoryRecord & {
  meanVolumeDb?: unknown;
};

type LaboratoryAudioProbeRecord = LaboratoryRecord & {
  silence?: unknown;
  volume?: unknown;
};

type LaboratoryProcessArtifactRecord = LaboratoryRecord & {
  id?: unknown;
  path?: unknown;
};

type LaboratoryTranscriptResultRecord = LaboratoryRecord & {
  artifact?: unknown;
  text?: unknown;
};

type LaboratoryProsodySummaryRecord = LaboratoryRecord & {
  columns?: unknown;
  estimatedPauseCount?: unknown;
  frameCount?: unknown;
  meanF0Hz?: unknown;
};

type LaboratoryProsodyExtractionRecord = LaboratoryRecord & {
  contourPath?: unknown;
  prosodySummary?: unknown;
};

type LaboratoryEmotionHeuristicRecord = LaboratoryRecord & {
  confidence?: unknown;
  cues?: unknown;
  disclaimer?: unknown;
  label?: unknown;
};

type LaboratoryLocalProcessResult = {
  artifacts: LaboratoryProcessArtifactRecord[];
  findings: LaboratoryRecord[];
  status: string;
  summary: string;
  warnings: string[];
};

type LaboratoryTranscriptSampleOptions = {
  language?: string | null;
  modelPolicy?: string | null;
  sampleSeconds: number;
};

type AudioAnalysisLocalProcessRunnerDeps = {
  buildEmotionHeuristicFromProsody: (
    prosodySummary: LaboratoryProsodySummaryRecord
  ) => LaboratoryEmotionHeuristicRecord;
  buildProcessSpeechAvailability: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord
  ) => LaboratorySpeechAvailabilityRecord;
  clone: (value: unknown) => unknown;
  createProcessArtifact: (
    moduleId: string,
    artifactKind: string,
    filePath: string,
    label: string,
    metadata: LaboratoryRecord
  ) => LaboratoryProcessArtifactRecord;
  createProcessFinding: (
    moduleId: string,
    findingKind: string,
    level: string,
    confidence: string,
    title: string,
    detail: string,
    evidenceCount: number,
    artifactIds: string[]
  ) => LaboratoryRecord;
  ensureProcessRuntimeDirectories: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    moduleOutputDir: string
  ) => Promise<unknown>;
  generateProcessSpectrogram: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ) => Promise<unknown>;
  generateProcessSpectrogramFromInputPath: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    inputPath: string,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string,
    label: string,
    metadata?: LaboratoryRecord
  ) => Promise<unknown>;
  generateProcessWaveform: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ) => Promise<unknown>;
  generateFilteredAudioArtifact: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string,
    filterGraph: string,
    label: string,
    metadata: LaboratoryRecord,
    outputExtension?: string
  ) => Promise<unknown>;
  generateSpectralDescriptorArtifact: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ) => Promise<unknown>;
  maybeRunTranscriptProfileSample: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    transcriptSampleSeconds: number | LaboratoryTranscriptSampleOptions
  ) => Promise<unknown>;
  normalizeProcessArtifact: (value: unknown) => LaboratoryProcessArtifactRecord;
  resolveOpenSmileProsodyRuntime: (runtime: LaboratoryAudioProcessRuntime) => unknown | null;
  runAudioStructureProbe: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    options?: LaboratoryRecord
  ) => Promise<unknown>;
  runOpenSmileProsodyExtraction: (
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    profileId: string
  ) => Promise<unknown>;
  toRecord: (value: unknown) => LaboratoryRecord;
  writeJsonFile: (path: string, content: LaboratoryRecord) => Promise<unknown>;
};

export function createAudioAnalysisLocalProcessRunners(deps: AudioAnalysisLocalProcessRunnerDeps) {
  const {
    buildEmotionHeuristicFromProsody,
    buildProcessSpeechAvailability,
    clone,
    createProcessArtifact,
    createProcessFinding,
    ensureProcessRuntimeDirectories,
    generateFilteredAudioArtifact,
    generateProcessSpectrogram,
    generateProcessSpectrogramFromInputPath,
    generateProcessWaveform,
    generateSpectralDescriptorArtifact,
    maybeRunTranscriptProfileSample,
    normalizeProcessArtifact,
    resolveOpenSmileProsodyRuntime,
    runAudioStructureProbe,
    runOpenSmileProsodyExtraction,
    toRecord,
    writeJsonFile,
  } = deps;

  function toAudioProbeBucketRecord(value: unknown): LaboratoryAudioProbeBucketRecord {
    return toRecord(value);
  }

  function toAudioVolumeRecord(value: unknown): LaboratoryAudioVolumeRecord {
    return toRecord(value);
  }

  function toAudioProbeRecord(value: unknown): LaboratoryAudioProbeRecord {
    return toRecord(value);
  }

  function toProcessArtifactRecord(value: unknown): LaboratoryProcessArtifactRecord {
    return toRecord(value);
  }

  function toTranscriptResultRecord(value: unknown): LaboratoryTranscriptResultRecord {
    return toRecord(value);
  }

  function toProsodySummaryRecord(value: unknown): LaboratoryProsodySummaryRecord {
    return toRecord(value);
  }

  function toProsodyExtractionRecord(value: unknown): LaboratoryProsodyExtractionRecord {
    return toRecord(value);
  }

  function toEmotionHeuristicRecord(value: unknown): LaboratoryEmotionHeuristicRecord {
    return toRecord(value);
  }

  function compactArtifacts(values: unknown[]): LaboratoryProcessArtifactRecord[] {
    return values.reduce(function (accumulator: LaboratoryProcessArtifactRecord[], value: unknown) {
      if (!value) {
        return accumulator;
      }
      accumulator.push(toProcessArtifactRecord(value));
      return accumulator;
    }, []);
  }

  function getModuleSettings(
    project: LaboratoryProjectRecord,
    moduleId: string
  ): LabSettingsRecord {
    const workbench = toRecord(project["workbench"]);
    const analysisSettings = toRecord(workbench["analysisSettings"]);
    const moduleSettings = toRecord(analysisSettings["modules"]);
    return normalizeLabAnalysisModuleSettings(moduleId, moduleSettings[moduleId]);
  }

  function getSampleWindowSeconds(settings: LabSettingsRecord, fallback: number): number {
    return Math.max(
      5,
      Math.min(600, Math.round(readNumberSetting(settings, "sampleWindowSeconds", fallback)))
    );
  }

  function getSensitivityLevel(
    settings: LabSettingsRecord,
    baseLevel: "low" | "medium" | "high",
    evidenceCount: number
  ): "low" | "medium" | "high" {
    const sensitivity = readStringSetting(settings, "sensitivity", "medium");
    if (sensitivity === "high" && evidenceCount > 0 && baseLevel === "low") {
      return "medium";
    }
    if (sensitivity === "low" && evidenceCount < 3 && baseLevel === "medium") {
      return "low";
    }
    return baseLevel;
  }

  function getArtifactPath(artifact: unknown): string | null {
    const record = toProcessArtifactRecord(artifact);
    return typeof record.path === "string" && record.path.trim() !== "" ? record.path : null;
  }

  function buildSampleWindowFilter(sampleWindowSeconds: number) {
    return `atrim=0:${String(sampleWindowSeconds)},asetpts=N/SR/TB`;
  }

  function fixedFilterNumber(value: number): string {
    return Number(value.toFixed(3)).toString();
  }

  const {
    runBandPassExplorationAudioAnalyzer,
    runFrequencyShiftReversalAudioAnalyzer,
    runHiddenPatternExtractionAudioAnalyzer,
    runPhaseRecoveryExperimentAudioAnalyzer,
    runSignalRecoveryAudioAnalyzer,
    runSpectrogramGuidedRecoveryAudioAnalyzer,
  } = createAudioAnalysisRecoveryProcessRunners({
    clone,
    createProcessArtifact,
    createProcessFinding,
    ensureProcessRuntimeDirectories,
    generateFilteredAudioArtifact,
    generateProcessSpectrogramFromInputPath,
    toRecord,
    writeJsonFile,
  });

  async function runSignalHealthAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    _artifactBase: string,
    _moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const settings = getModuleSettings(project, moduleId);
    const sampleWindowSeconds = getSampleWindowSeconds(settings, 60);
    const silenceThresholdDb = readNumberSetting(settings, "silenceThresholdDb", -38);
    const audioProbe = toAudioProbeRecord(
      await runAudioStructureProbe(runtime, project, requestId, jobId, target, {
        analysisScope: toRecord(toRecord(project["workbench"])["analysisScope"]),
      })
    );
    const silence = toAudioProbeBucketRecord(audioProbe.silence);
    const volume = toAudioVolumeRecord(audioProbe.volume);
    const silenceCount =
      typeof silence.count === "number" && Number.isFinite(silence.count) ? silence.count : 0;
    const findings: LaboratoryRecord[] = [];
    const warnings: string[] = [];

    if (silenceCount > 0) {
      findings.push(
        createProcessFinding(
          moduleId,
          "measured",
          getSensitivityLevel(settings, silenceCount > 3 ? "medium" : "low", silenceCount),
          "medium",
          "Silence pockets detected",
          `Silence detection found ${silenceCount} pocket(s) in the ${sampleWindowSeconds}s focus window using a ${silenceThresholdDb} dB threshold.`,
          silenceCount,
          []
        )
      );
    }
    if (typeof volume.meanVolumeDb === "number" && Number.isFinite(volume.meanVolumeDb)) {
      warnings.push(`Mean volume: ${volume.meanVolumeDb} dB`);
      if (volume.meanVolumeDb <= silenceThresholdDb && silenceCount === 0) {
        findings.push(
          createProcessFinding(
            moduleId,
            "measured",
            getSensitivityLevel(settings, "low", 1),
            "medium",
            "Low-volume window detected",
            `Mean volume ${volume.meanVolumeDb} dB is below the configured ${silenceThresholdDb} dB silence threshold for the ${sampleWindowSeconds}s focus window.`,
            1,
            []
          )
        );
      }
    }
    warnings.push(`Signal window: ${sampleWindowSeconds}s @ ${silenceThresholdDb} dB`);

    return {
      artifacts: [],
      findings: findings,
      status: "ready",
      summary: `Signal health checks finished on a ${sampleWindowSeconds}s configured focus window.`,
      warnings: warnings,
    };
  }

  async function runSpectralArtifactsAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);

    const settings = getModuleSettings(project, moduleId);
    const sampleWindowSeconds = getSampleWindowSeconds(settings, 60);
    const windowedAudio = await generateFilteredAudioArtifact(
      runtime,
      project,
      requestId,
      jobId,
      target,
      `${artifactBase}-window`,
      moduleOutputDir,
      moduleId,
      buildSampleWindowFilter(sampleWindowSeconds),
      `Spectral ${sampleWindowSeconds}s Window`,
      {
        settingsUsed: settings,
        windowSeconds: sampleWindowSeconds,
      }
    );
    const windowedAudioPath = getArtifactPath(windowedAudio);
    const scopedTarget =
      windowedAudioPath === null
        ? target
        : {
            ...target,
            path: windowedAudioPath,
          };
    const spectrogram = await generateProcessSpectrogram(
      runtime,
      project,
      requestId,
      jobId,
      scopedTarget,
      artifactBase,
      moduleOutputDir,
      moduleId
    );
    const waveform = await generateProcessWaveform(
      runtime,
      project,
      requestId,
      jobId,
      scopedTarget,
      artifactBase,
      moduleOutputDir,
      moduleId
    );
    const descriptorArtifact = await generateSpectralDescriptorArtifact(
      runtime,
      project,
      requestId,
      jobId,
      scopedTarget,
      artifactBase,
      moduleOutputDir,
      moduleId
    );
    const artifacts = compactArtifacts([windowedAudio, spectrogram, waveform, descriptorArtifact]);
    const descriptorArtifactRecord = descriptorArtifact
      ? toProcessArtifactRecord(descriptorArtifact)
      : null;

    return {
      artifacts: artifacts,
      findings: descriptorArtifactRecord
        ? [
            createProcessFinding(
              moduleId,
              "derived",
              getSensitivityLevel(settings, "low", 4),
              "medium",
              "Spectral descriptor baseline captured",
              `Centroid, rolloff, flatness, and flux summaries were derived from a ${sampleWindowSeconds}s configured audio window.`,
              4,
              [String(descriptorArtifactRecord.id || "")]
            ),
          ]
        : [],
      status: "ready",
      summary: `Spectral artifacts and descriptor summaries were generated from a ${sampleWindowSeconds}s configured window.`,
      warnings: [],
    };
  }

  async function runTranscriptionAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    _moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const speech = buildProcessSpeechAvailability(runtime, project);
    if (speech.ready !== true) {
      return {
        artifacts: [],
        findings: [],
        status: "blocked",
        summary: "Transcript tooling is not ready on this runtime.",
        warnings: [],
      };
    }

    const settings = getModuleSettings(project, moduleId);
    const sampleSeconds = Math.round(readNumberSetting(settings, "sampleSeconds", 45));
    const transcriptOptions: LaboratoryTranscriptSampleOptions = {
      language: readStringSetting(settings, "language", "auto"),
      modelPolicy: readStringSetting(settings, "modelPolicy", "selected"),
      sampleSeconds,
    };
    const transcriptResult = toTranscriptResultRecord(
      await maybeRunTranscriptProfileSample(
        runtime,
        project,
        requestId,
        jobId,
        target,
        artifactBase,
        transcriptOptions
      )
    );
    const transcriptArtifact = transcriptResult.artifact
      ? normalizeProcessArtifact({
          ...toRecord(transcriptResult.artifact),
          moduleId: moduleId,
        })
      : null;
    const transcriptArtifactRecord = transcriptArtifact
      ? toProcessArtifactRecord(transcriptArtifact)
      : null;
    if (transcriptArtifactRecord) {
      const transcriptText = typeof transcriptResult.text === "string" ? transcriptResult.text : "";
      return {
        artifacts: [transcriptArtifactRecord],
        findings: [
          createProcessFinding(
            moduleId,
            "measured",
            "low",
            "medium",
            "Transcript sample captured",
            `Transcript sampling returned ${
              transcriptText.split(/\s+/).filter(Boolean).length
            } words from a ${sampleSeconds} second sample for the active audio target.`,
            1,
            [String(transcriptArtifactRecord.id || "")]
          ),
        ],
        status: "ready",
        summary: "Transcript sampling finished for the active target.",
        warnings: [],
      };
    }

    return {
      artifacts: [],
      findings: [],
      status: "ready",
      summary: "Transcript tooling ran without a persisted sample artifact.",
      warnings: [],
    };
  }

  async function runProsodyAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);

    if (resolveOpenSmileProsodyRuntime(runtime) === null) {
      return {
        artifacts: [],
        findings: [],
        status: "blocked",
        summary: "Prosody config assets are missing from the room package.",
        warnings: ["Room-local openSMILE config package is unavailable on this runtime."],
      };
    }

    const settings = getModuleSettings(project, moduleId);
    const windowSeconds = Math.max(
      0.5,
      Math.min(10, readNumberSetting(settings, "windowSeconds", 3))
    );
    const silenceThresholdDb = readNumberSetting(settings, "silenceThresholdDb", -38);
    const prosodyFocusAudio = await generateFilteredAudioArtifact(
      runtime,
      project,
      requestId,
      jobId,
      target,
      `${artifactBase}-prosody-focus`,
      moduleOutputDir,
      moduleId,
      `silenceremove=stop_periods=-1:stop_duration=${fixedFilterNumber(
        windowSeconds
      )}:stop_threshold=${String(silenceThresholdDb)}dB`,
      "Prosody Focus Audio",
      {
        settingsUsed: settings,
        silenceThresholdDb,
        windowSeconds,
      }
    );
    const prosodyFocusPath = getArtifactPath(prosodyFocusAudio);
    const prosodyTarget =
      prosodyFocusPath === null
        ? target
        : {
            ...target,
            path: prosodyFocusPath,
          };
    const extraction = toProsodyExtractionRecord(
      await runOpenSmileProsodyExtraction(
        runtime,
        project,
        requestId,
        jobId,
        prosodyTarget,
        artifactBase,
        moduleOutputDir,
        "prosody"
      )
    );
    const contourPath = typeof extraction.contourPath === "string" ? extraction.contourPath : "";
    const summaryPath = `${moduleOutputDir}/${artifactBase}-prosody.json`;
    const prosodySummary = toProsodySummaryRecord(extraction.prosodySummary);
    await writeJsonFile(summaryPath, {
      generatedAt: new Date().toISOString(),
      prosodySummary: prosodySummary,
      settingsUsed: settings,
      target: toRecord(clone(target)),
    });

    const contourArtifact = createProcessArtifact(
      moduleId,
      "prosody-contours",
      contourPath,
      "Prosody Contours",
      {
        columnCount: Array.isArray(prosodySummary.columns) ? prosodySummary.columns.length : 0,
        frameCount:
          typeof prosodySummary.frameCount === "number" ? prosodySummary.frameCount : null,
        settingsUsed: settings,
      }
    );
    const summaryArtifact = createProcessArtifact(
      moduleId,
      "prosody-summary",
      summaryPath,
      "Prosody Summary",
      {
        prosodySummary: prosodySummary,
        settingsUsed: settings,
      }
    );
    const artifacts = compactArtifacts([prosodyFocusAudio, contourArtifact, summaryArtifact]);
    const artifactIds = artifacts
      .map(function (artifact) {
        return typeof artifact.id === "string" && artifact.id.trim() !== "" ? artifact.id : null;
      })
      .filter((artifactId): artifactId is string => artifactId !== null);
    const detailParts = [
      typeof prosodySummary.frameCount === "number" ? `${prosodySummary.frameCount} frames` : null,
      typeof prosodySummary.meanF0Hz === "number"
        ? `mean F0 ${Number(prosodySummary.meanF0Hz).toFixed(1)} Hz`
        : null,
      typeof prosodySummary.estimatedPauseCount === "number"
        ? `${prosodySummary.estimatedPauseCount} estimated pauses`
        : null,
    ].filter((entry): entry is string => entry !== null);

    return {
      artifacts: artifacts,
      findings: [
        createProcessFinding(
          moduleId,
          "derived",
          "low",
          "medium",
          "Prosody contour baseline captured",
          detailParts.length > 0
            ? `openSMILE produced ${detailParts.join(", ")} after applying the ${windowSeconds}s / ${silenceThresholdDb} dB prosody focus settings.`
            : `openSMILE produced a prosody contour baseline after applying the ${windowSeconds}s / ${silenceThresholdDb} dB prosody focus settings.`,
          detailParts.length,
          artifactIds
        ),
      ],
      status: "ready",
      summary:
        "Prosody contours and pacing metrics were generated with the configured focus settings.",
      warnings: [],
    };
  }

  async function runEmotionHeuristicAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);

    if (resolveOpenSmileProsodyRuntime(runtime) === null) {
      return {
        artifacts: [],
        findings: [],
        status: "blocked",
        summary: "Emotion heuristics need the same packaged openSMILE config assets as prosody.",
        warnings: ["Room-local openSMILE config package is unavailable on this runtime."],
      };
    }

    const settings = getModuleSettings(project, moduleId);
    const extraction = toProsodyExtractionRecord(
      await runOpenSmileProsodyExtraction(
        runtime,
        project,
        requestId,
        jobId,
        target,
        artifactBase,
        moduleOutputDir,
        "emotion-prosody"
      )
    );
    const heuristic = toEmotionHeuristicRecord(
      buildEmotionHeuristicFromProsody(toProsodySummaryRecord(extraction.prosodySummary))
    );
    const sensitivity = readStringSetting(settings, "heuristicSensitivity", "medium");
    const heuristicScore =
      typeof heuristic["score"] === "number" && Number.isFinite(heuristic["score"])
        ? heuristic["score"]
        : 0;
    const adjustedConfidence =
      sensitivity === "high" && Math.abs(heuristicScore) >= 2
        ? "medium"
        : sensitivity === "low"
          ? "low"
          : heuristic.confidence;
    const summaryPath = `${moduleOutputDir}/${artifactBase}-emotion.json`;
    await writeJsonFile(summaryPath, {
      emotionHeuristic: heuristic,
      generatedAt: new Date().toISOString(),
      settingsUsed: settings,
      target: toRecord(clone(target)),
    });

    const summaryArtifact = createProcessArtifact(
      moduleId,
      "emotion-summary",
      summaryPath,
      "Emotion Heuristic Summary",
      {
        emotionHeuristic: heuristic,
        settingsUsed: settings,
      }
    );
    const artifacts = compactArtifacts([summaryArtifact]);
    const artifactIds = artifacts
      .map(function (artifact) {
        return typeof artifact.id === "string" && artifact.id.trim() !== "" ? artifact.id : null;
      })
      .filter((artifactId): artifactId is string => artifactId !== null);
    const cueText =
      Array.isArray(heuristic.cues) && heuristic.cues.length > 0 ? heuristic.cues.join(" ") : null;
    const disclaimer =
      typeof heuristic.disclaimer === "string" ? heuristic.disclaimer : "Heuristic output only.";
    const label = typeof heuristic.label === "string" ? heuristic.label : "Emotion label";
    const confidence =
      typeof adjustedConfidence === "string" && adjustedConfidence.trim() !== ""
        ? adjustedConfidence
        : "low";

    return {
      artifacts: artifacts,
      findings: [
        createProcessFinding(
          moduleId,
          "heuristic",
          "low",
          confidence,
          "Heuristic emotion label generated",
          cueText !== null ? `${label}. ${cueText} ${disclaimer}` : `${label}. ${disclaimer}`,
          Array.isArray(heuristic.cues) ? heuristic.cues.length : 0,
          artifactIds
        ),
      ],
      status: "ready",
      summary: "A coarse heuristic emotion label was derived from prosody signals.",
      warnings: [disclaimer],
    };
  }

  return {
    runBandPassExplorationAudioAnalyzer: runBandPassExplorationAudioAnalyzer,
    runEmotionHeuristicAudioAnalyzer: runEmotionHeuristicAudioAnalyzer,
    runFrequencyShiftReversalAudioAnalyzer: runFrequencyShiftReversalAudioAnalyzer,
    runHiddenPatternExtractionAudioAnalyzer: runHiddenPatternExtractionAudioAnalyzer,
    runPhaseRecoveryExperimentAudioAnalyzer: runPhaseRecoveryExperimentAudioAnalyzer,
    runProsodyAudioAnalyzer: runProsodyAudioAnalyzer,
    runSignalHealthAudioAnalyzer: runSignalHealthAudioAnalyzer,
    runSignalRecoveryAudioAnalyzer: runSignalRecoveryAudioAnalyzer,
    runSpectrogramGuidedRecoveryAudioAnalyzer: runSpectrogramGuidedRecoveryAudioAnalyzer,
    runSpectralArtifactsAudioAnalyzer: runSpectralArtifactsAudioAnalyzer,
    runTranscriptionAudioAnalyzer: runTranscriptionAudioAnalyzer,
  };
}
