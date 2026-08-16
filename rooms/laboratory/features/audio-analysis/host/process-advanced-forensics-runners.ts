import { normalizeLabAnalysisModuleSettings } from "../../../domain/lab-types.js";
import type { LabSettingsRecord } from "../../../domain/lab-types.js";
import { ensureAdvancedAudioAnalysisSettingsRegistered } from "../../../domain/lab-advanced-audio-settings.js";
import {
  readBooleanSetting,
  readNumberSetting,
  readStringSetting,
} from "../../../shared/host/settings-readers.js";

ensureAdvancedAudioAnalysisSettingsRegistered();

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryAudioProcessRuntime = LaboratoryRecord;
type LaboratoryProjectRecord = LaboratoryRecord;
type LaboratoryAudioTargetRecord = LaboratoryRecord & {
  path?: unknown;
};
type LaboratoryProcessArtifactRecord = LaboratoryRecord & {
  id?: unknown;
  path?: unknown;
};

type LaboratoryLocalProcessResult = {
  artifacts: LaboratoryProcessArtifactRecord[];
  findings: LaboratoryRecord[];
  status: string;
  summary: string;
  warnings: string[];
};

type LaboratoryProfileToolRequest = {
  requestId: string;
  jobId: string;
  toolId: string;
  cwd: string;
  args: string[];
  timeoutMs: number;
};

type AudioModuleRunner = (
  runtime: LaboratoryAudioProcessRuntime,
  project: LaboratoryProjectRecord,
  requestId: string,
  jobId: string,
  target: LaboratoryAudioTargetRecord,
  artifactBase: string,
  moduleOutputDir: string,
  moduleId: string
) => Promise<LaboratoryLocalProcessResult>;

type AdvancedAudioForensicsDeps = {
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
  runProfileTool: (
    runtime: LaboratoryAudioProcessRuntime,
    request: LaboratoryProfileToolRequest
  ) => Promise<unknown>;
  toRecord: (value: unknown) => LaboratoryRecord;
};

type OptionalArtifactResult = {
  artifact: LaboratoryProcessArtifactRecord | null;
  warning: string | null;
};

type SlowPlaybackVariant = {
  filterGraph: string;
  label: string;
  mode: string;
  scale: number;
  suffix: string;
};

const SLOW_PLAYBACK_VARIANTS: SlowPlaybackVariant[] = [
  {
    filterGraph: "atempo=0.5,atempo=0.5,atempo=0.5,atempo=0.8",
    label: "Slow Playback 0.1x",
    mode: "slow-0-1",
    scale: 0.1,
    suffix: "slow-0_1x",
  },
  {
    filterGraph: "atempo=0.5,atempo=0.5",
    label: "Slow Playback 0.25x",
    mode: "slow-0-25",
    scale: 0.25,
    suffix: "slow-0_25x",
  },
  {
    filterGraph: "atempo=0.5",
    label: "Slow Playback 0.5x",
    mode: "slow-0-5",
    scale: 0.5,
    suffix: "slow-0_5x",
  },
];

const PITCH_SHIFT_LADDER = [-12, -6, 6, 12] as const;
const PITCH_REFERENCE_SAMPLE_RATE = 48_000;
const EMPTY_OPTIONAL_ARTIFACT: OptionalArtifactResult = {
  artifact: null,
  warning: null,
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function getArtifactId(artifact: LaboratoryProcessArtifactRecord | null): string | null {
  return artifact === null ? null : asNonEmptyString(artifact.id);
}

function compactArtifactIds(artifacts: Array<LaboratoryProcessArtifactRecord | null>) {
  return artifacts
    .map(getArtifactId)
    .filter((artifactId): artifactId is string => artifactId !== null);
}

function appendSummary(baseSummary: string, suffix: string) {
  const normalizedBase = baseSummary.trim();
  return normalizedBase === "" ? suffix : `${normalizedBase} ${suffix}`;
}

function fixedFilterNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

function buildAtempoFilters(tempo: number) {
  const filters: string[] = [];
  let remaining = Math.max(0.01, tempo);

  while (remaining < 0.5 - 0.000001) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  while (remaining > 2 + 0.000001) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  filters.push(`atempo=${fixedFilterNumber(remaining)}`);
  return filters;
}

function buildPitchShiftFilter(semitones: number) {
  const pitchFactor = Math.pow(2, semitones / 12);
  const shiftedSampleRate = Math.max(8_000, Math.round(PITCH_REFERENCE_SAMPLE_RATE * pitchFactor));
  const compensationTempo = 1 / pitchFactor;
  return [
    `aresample=${PITCH_REFERENCE_SAMPLE_RATE}`,
    `asetrate=${shiftedSampleRate}`,
    `aresample=${PITCH_REFERENCE_SAMPLE_RATE}`,
    ...buildAtempoFilters(compensationTempo),
  ].join(",");
}

function formatSemitone(value: number) {
  return `${value > 0 ? "+" : ""}${String(value)}`;
}

export function createAdvancedAudioForensicsRunners(deps: AdvancedAudioForensicsDeps) {
  const {
    createProcessArtifact,
    createProcessFinding,
    ensureProcessRuntimeDirectories,
    generateFilteredAudioArtifact,
    runProfileTool,
    toRecord,
  } = deps;

  function toArtifactRecord(value: unknown): LaboratoryProcessArtifactRecord {
    return toRecord(value);
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

  function requireTargetPath(target: LaboratoryAudioTargetRecord) {
    const targetPath = asNonEmptyString(target.path);
    if (targetPath === null) {
      throw new Error("Audio analysis target path is required for advanced forensic artifacts.");
    }
    return targetPath;
  }

  function getSlowPlaybackVariants(settings: LabSettingsRecord) {
    const mode = readStringSetting(settings, "slowPlaybackMode", "all");
    if (mode === "off") {
      return [];
    }
    if (mode === "all") {
      return SLOW_PLAYBACK_VARIANTS.slice();
    }
    const selected = SLOW_PLAYBACK_VARIANTS.find((variant) => variant.mode === mode);
    return selected ? [selected] : SLOW_PLAYBACK_VARIANTS.slice();
  }

  function getPitchShiftTargets(settings: LabSettingsRecord) {
    const mode = readStringSetting(settings, "pitchShiftMode", "ladder");
    if (mode === "off") {
      return [];
    }
    if (mode === "single") {
      const requested = readNumberSetting(settings, "pitchSemitones", 6);
      return [Math.max(-24, Math.min(24, Math.round(requested)))];
    }
    return PITCH_SHIFT_LADDER.slice();
  }

  async function generateSpectrumMap(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string,
    options: {
      artifactKind: string;
      filterGraph: string;
      label: string;
      metadata: LaboratoryRecord;
      suffix: string;
    }
  ): Promise<LaboratoryProcessArtifactRecord> {
    await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);
    const targetPath = requireTargetPath(target);
    const outputPath = `${moduleOutputDir}/${artifactBase}-${options.suffix}.png`;
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: moduleOutputDir,
      args: ["-y", "-i", targetPath, "-lavfi", options.filterGraph, "-frames:v", "1", outputPath],
      timeoutMs: 90_000,
    });
    return createProcessArtifact(moduleId, options.artifactKind, outputPath, options.label, {
      ...options.metadata,
      filterGraph: options.filterGraph,
    });
  }

  async function trySpectrumMap(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string,
    options: Parameters<typeof generateSpectrumMap>[8]
  ): Promise<OptionalArtifactResult> {
    try {
      return {
        artifact: await generateSpectrumMap(
          runtime,
          project,
          requestId,
          jobId,
          target,
          artifactBase,
          moduleOutputDir,
          moduleId,
          options
        ),
        warning: null,
      };
    } catch (error) {
      return {
        artifact: null,
        warning: `${options.label} could not be generated: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  async function tryFilteredAudio(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string,
    options: {
      filterGraph: string;
      label: string;
      metadata: LaboratoryRecord;
      suffix: string;
    }
  ): Promise<OptionalArtifactResult> {
    try {
      const artifact = toArtifactRecord(
        await generateFilteredAudioArtifact(
          runtime,
          project,
          requestId,
          jobId,
          target,
          `${artifactBase}-${options.suffix}`,
          moduleOutputDir,
          moduleId,
          options.filterGraph,
          options.label,
          options.metadata,
          "wav"
        )
      );
      return { artifact, warning: null };
    } catch (error) {
      return {
        artifact: null,
        warning: `${options.label} could not be generated: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  function augmentSpectralArtifacts(baseRunner: AudioModuleRunner): AudioModuleRunner {
    return async function runAdvancedSpectralArtifacts(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId
    ) {
      const baseResult = await baseRunner(
        runtime,
        project,
        requestId,
        jobId,
        target,
        artifactBase,
        moduleOutputDir,
        moduleId
      );
      const settings = getModuleSettings(project, moduleId);
      const subsonicEnabled = readBooleanSetting(settings, "subsonicMap", true);
      const inverseSpectrumEnabled = readBooleanSetting(settings, "inverseSpectrumMap", true);
      const subsonic = subsonicEnabled
        ? await trySpectrumMap(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            moduleOutputDir,
            moduleId,
            {
              artifactKind: "subsonic-energy-map",
              filterGraph:
                "showspectrumpic=s=1600x440:legend=1:fscale=lin:scale=log:start=0:stop=20:drange=120",
              label: "Subsonic Energy Map 0-20 Hz",
              metadata: {
                analysisType: "subsonic-energy-map",
                bandHz: [0, 20],
                settingsUsed: settings,
              },
              suffix: "subsonic-0-20hz",
            }
          )
        : EMPTY_OPTIONAL_ARTIFACT;
      const inverseSpectrum = inverseSpectrumEnabled
        ? await trySpectrumMap(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            moduleOutputDir,
            moduleId,
            {
              artifactKind: "inverse-spectrum-map",
              filterGraph: "showspectrumpic=s=1600x440:legend=1:fscale=lin:scale=log,vflip",
              label: "Inverse Spectrum Map",
              metadata: {
                analysisType: "frequency-axis-inversion",
                audioResynthesis: false,
                settingsUsed: settings,
              },
              suffix: "inverse-spectrum",
            }
          )
        : EMPTY_OPTIONAL_ARTIFACT;
      const extraArtifacts = [subsonic.artifact, inverseSpectrum.artifact].filter(
        (artifact): artifact is LaboratoryProcessArtifactRecord => artifact !== null
      );
      const findings = baseResult.findings.slice();
      const subsonicId = getArtifactId(subsonic.artifact);
      if (subsonicId !== null) {
        findings.push(
          createProcessFinding(
            moduleId,
            "measured",
            "low",
            "medium",
            "Subsonic 0-20 Hz energy map generated",
            "A dedicated linear-frequency spectrogram was generated for the 0-20 Hz band so very-low-frequency energy can be inspected independently from the audible spectrum.",
            1,
            [subsonicId]
          )
        );
      }
      const inverseId = getArtifactId(inverseSpectrum.artifact);
      if (inverseId !== null) {
        findings.push(
          createProcessFinding(
            moduleId,
            "derived",
            "low",
            "medium",
            "Inverse spectrum view generated",
            "The frequency axis was inverted as a visualization aid. This does not resynthesize or decode spectrally inverted audio.",
            1,
            [inverseId]
          )
        );
      }
      const requestedCount = Number(subsonicEnabled) + Number(inverseSpectrumEnabled);
      const warnings = baseResult.warnings
        .concat(
          [subsonic.warning, inverseSpectrum.warning].filter(
            (value): value is string => value !== null
          )
        )
        .concat(
          inverseSpectrum.artifact === null
            ? []
            : [
                "Inverse Spectrum Map is a visualization transform only; it is not an audio restoration result.",
              ]
        );
      return {
        ...baseResult,
        artifacts: baseResult.artifacts.concat(extraArtifacts),
        findings,
        summary: appendSummary(
          baseResult.summary,
          requestedCount === 0
            ? "Advanced spectrum inspection maps were disabled by module settings."
            : extraArtifacts.length > 0
              ? `${String(extraArtifacts.length)} advanced spectrum inspection artifact(s) were added.`
              : "Advanced spectrum artifacts were requested but no extra map was produced."
        ),
        warnings,
      };
    };
  }

  function augmentSpectrogramGuidedRecovery(baseRunner: AudioModuleRunner): AudioModuleRunner {
    return async function runSlowPlaybackRecovery(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId
    ) {
      const baseResult = await baseRunner(
        runtime,
        project,
        requestId,
        jobId,
        target,
        artifactBase,
        moduleOutputDir,
        moduleId
      );
      const settings = getModuleSettings(project, moduleId);
      const variants = getSlowPlaybackVariants(settings);
      const slowResults: OptionalArtifactResult[] = [];
      if (variants.length > 0) {
        await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);
      }
      for (const variant of variants) {
        slowResults.push(
          // eslint-disable-next-line no-await-in-loop -- sequential audio processing variants must run in order
          await tryFilteredAudio(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            moduleOutputDir,
            moduleId,
            {
              filterGraph: variant.filterGraph,
              label: variant.label,
              metadata: {
                analysisType: "slow-playback",
                pitchPreserved: true,
                settingsUsed: settings,
                tempoScale: variant.scale,
              },
              suffix: variant.suffix,
            }
          )
        );
      }
      const extraArtifacts = slowResults
        .map((result) => result.artifact)
        .filter((artifact): artifact is LaboratoryProcessArtifactRecord => artifact !== null);
      const artifactIds = compactArtifactIds(slowResults.map((result) => result.artifact));
      const findings = baseResult.findings.slice();
      const variantLabel = variants.map((variant) => `${String(variant.scale)}x`).join(", ");
      if (artifactIds.length > 0) {
        findings.push(
          createProcessFinding(
            moduleId,
            "derived",
            "low",
            "medium",
            "Slow-playback inspection variants generated",
            `Pitch-preserving ${variantLabel} listening variant(s) were generated for transient and low-level event inspection.`,
            artifactIds.length,
            artifactIds
          )
        );
      }
      return {
        ...baseResult,
        artifacts: baseResult.artifacts.concat(extraArtifacts),
        findings,
        summary: appendSummary(
          baseResult.summary,
          variants.length === 0
            ? "Slow-playback review variants were disabled by module settings."
            : artifactIds.length > 0
              ? `Pitch-preserving ${variantLabel} review variant(s) were added.`
              : "Slow-playback variants were requested but could not be produced."
        ),
        warnings: baseResult.warnings
          .concat(
            slowResults
              .map((result) => result.warning)
              .filter((value): value is string => value !== null)
          )
          .concat(
            artifactIds.length > 0
              ? [
                  "Extreme tempo reduction can introduce WSOLA time-stretch artifacts; compare against the original source.",
                ]
              : []
          ),
      };
    };
  }

  function augmentFrequencyShiftReversal(baseRunner: AudioModuleRunner): AudioModuleRunner {
    return async function runPitchShiftExploration(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId
    ) {
      const baseResult = await baseRunner(
        runtime,
        project,
        requestId,
        jobId,
        target,
        artifactBase,
        moduleOutputDir,
        moduleId
      );
      const settings = getModuleSettings(project, moduleId);
      const pitchTargets = getPitchShiftTargets(settings);
      const pitchResults: OptionalArtifactResult[] = [];
      if (pitchTargets.length > 0) {
        await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);
      }
      for (const semitones of pitchTargets) {
        const direction = semitones < 0 ? "down" : semitones > 0 ? "up" : "neutral";
        const magnitude = Math.abs(semitones);
        pitchResults.push(
          // eslint-disable-next-line no-await-in-loop -- sequential pitch shift targets must run in order
          await tryFilteredAudio(
            runtime,
            project,
            requestId,
            jobId,
            target,
            artifactBase,
            moduleOutputDir,
            moduleId,
            {
              filterGraph: buildPitchShiftFilter(semitones),
              label: `Pitch Shift ${formatSemitone(semitones)} st`,
              metadata: {
                analysisType: "pitch-shift",
                referenceSampleRate: PITCH_REFERENCE_SAMPLE_RATE,
                semitones,
                settingsUsed: settings,
                tempoCompensated: true,
              },
              suffix: `pitch-${direction}-${magnitude}st`,
            }
          )
        );
      }
      const extraArtifacts = pitchResults
        .map((result) => result.artifact)
        .filter((artifact): artifact is LaboratoryProcessArtifactRecord => artifact !== null);
      const artifactIds = compactArtifactIds(pitchResults.map((result) => result.artifact));
      const findings = baseResult.findings.slice();
      const pitchLabel = pitchTargets.map(formatSemitone).join(", ");
      if (artifactIds.length > 0) {
        findings.push(
          createProcessFinding(
            moduleId,
            "derived",
            "low",
            "medium",
            "Pitch-shift exploration variants generated",
            `Tempo-compensated pitch variants at ${pitchLabel} semitone(s) were generated alongside the existing frequency-shift reversal output.`,
            artifactIds.length,
            artifactIds
          )
        );
      }
      return {
        ...baseResult,
        artifacts: baseResult.artifacts.concat(extraArtifacts),
        findings,
        summary: appendSummary(
          baseResult.summary,
          pitchTargets.length === 0
            ? "Pitch-shift review variants were disabled by module settings."
            : artifactIds.length > 0
              ? `True pitch-shift review variants were added at ${pitchLabel} semitone(s).`
              : "Pitch-shift variants were requested but could not be produced."
        ),
        warnings: baseResult.warnings
          .concat(
            pitchResults
              .map((result) => result.warning)
              .filter((value): value is string => value !== null)
          )
          .concat(
            artifactIds.length > 0
              ? [
                  "Pitch-shift variants use resampling plus tempo compensation and are exploratory listening aids, not source-faithful restorations.",
                ]
              : []
          ),
      };
    };
  }

  return {
    augmentFrequencyShiftReversal,
    augmentSpectralArtifacts,
    augmentSpectrogramGuidedRecovery,
  };
}
