import { normalizeLabAnalysisModuleSettings } from "../../../domain/lab-types.js";
import type { LabSettingsRecord } from "../../../domain/lab-types.js";
import { readNumberSetting, readStringSetting } from "../../../shared/host/settings-readers.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryAudioProcessRuntime = LaboratoryRecord;

type LaboratoryProjectRecord = LaboratoryRecord;

type LaboratoryAudioTargetRecord = LaboratoryRecord;

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

type RecoveryExperimentConfig = {
  detail: string;
  filterGraph: string;
  label: string;
  manifestLabel: string;
  settings?: LabSettingsRecord;
  summary: string;
  title: string;
  warning: string;
};

type AudioAnalysisRecoveryProcessRunnerDeps = {
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
  toRecord: (value: unknown) => LaboratoryRecord;
  writeJsonFile: (path: string, content: LaboratoryRecord) => Promise<unknown>;
};

export function createAudioAnalysisRecoveryProcessRunners(
  deps: AudioAnalysisRecoveryProcessRunnerDeps
) {
  const {
    clone,
    createProcessArtifact,
    createProcessFinding,
    ensureProcessRuntimeDirectories,
    generateFilteredAudioArtifact,
    generateProcessSpectrogramFromInputPath,
    toRecord,
    writeJsonFile,
  } = deps;

  function toProcessArtifactRecord(value: unknown): LaboratoryProcessArtifactRecord {
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

  function collectArtifactIds(artifacts: LaboratoryProcessArtifactRecord[]): string[] {
    return artifacts
      .map(function (artifact) {
        return typeof artifact.id === "string" && artifact.id.trim() !== "" ? artifact.id : null;
      })
      .filter((artifactId): artifactId is string => artifactId !== null);
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

  function fixedFilterNumber(value: number): string {
    return Number(value.toFixed(3)).toString();
  }

  function getDenoiseNoiseFloor(settings: LabSettingsRecord, fallback = -25): number {
    const denoise = readStringSetting(settings, "denoise", "medium");
    if (denoise === "strong") {
      return -35;
    }
    if (denoise === "light") {
      return -18;
    }
    return fallback;
  }

  async function runRecoveryExperiment(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string,
    config: RecoveryExperimentConfig
  ): Promise<LaboratoryLocalProcessResult> {
    await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);

    const filteredAudio = toProcessArtifactRecord(
      await generateFilteredAudioArtifact(
        runtime,
        project,
        requestId,
        jobId,
        target,
        `${artifactBase}-recovery`,
        moduleOutputDir,
        moduleId,
        config.filterGraph,
        config.label,
        {
          experiment: moduleId,
          scope: "audio-recovery",
          settingsUsed: config.settings || {},
        }
      )
    );
    const filteredPath =
      typeof filteredAudio.path === "string" && filteredAudio.path.trim() !== ""
        ? filteredAudio.path
        : null;
    const spectrogram = filteredPath
      ? toProcessArtifactRecord(
          await generateProcessSpectrogramFromInputPath(
            runtime,
            project,
            requestId,
            jobId,
            filteredPath,
            `${artifactBase}-recovery`,
            moduleOutputDir,
            moduleId,
            `${config.label} Spectrogram`,
            {
              experiment: moduleId,
              sourceArtifactId: typeof filteredAudio.id === "string" ? filteredAudio.id : null,
              settingsUsed: config.settings || {},
            }
          )
        )
      : null;
    const manifestPath = `${moduleOutputDir}/${artifactBase}-recovery.json`;
    await writeJsonFile(manifestPath, {
      moduleId,
      generatedAt: new Date().toISOString(),
      target: toRecord(clone(target)),
      filterGraph: config.filterGraph,
      settingsUsed: config.settings || {},
      artifacts: [filteredAudio, spectrogram].filter(Boolean),
      detail: config.detail,
      summary: config.summary,
      warning: config.warning,
    });
    const manifestArtifact = createProcessArtifact(
      moduleId,
      "recovery-manifest",
      manifestPath,
      config.manifestLabel,
      {
        experiment: moduleId,
        filterGraph: config.filterGraph,
        settingsUsed: config.settings || {},
      }
    );
    const artifacts = compactArtifacts([spectrogram, filteredAudio, manifestArtifact]);
    const artifactIds = collectArtifactIds(artifacts);

    return {
      artifacts,
      findings: [
        createProcessFinding(
          moduleId,
          "derived",
          "medium",
          "low",
          config.title,
          config.detail,
          artifactIds.length,
          artifactIds
        ),
      ],
      status: "ready",
      summary: config.summary,
      warnings: [config.warning],
    };
  }

  async function runSignalRecoveryAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const settings = getModuleSettings(project, moduleId);
    const preset = readStringSetting(settings, "recoveryPreset", "speech");
    const gain = readNumberSetting(settings, "gain", 2.2);
    const lowpass = preset === "broadband" ? 12000 : preset === "hidden" ? 6400 : 4800;
    const highpass = preset === "broadband" ? 40 : preset === "hidden" ? 120 : 80;
    return runRecoveryExperiment(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId,
      {
        filterGraph: `highpass=f=${highpass},lowpass=f=${lowpass},afftdn=nf=${getDenoiseNoiseFloor(
          settings,
          -25
        )},acompressor=threshold=-18dB:ratio=2:attack=20:release=250,volume=${fixedFilterNumber(gain)}`,
        label: "Signal Recovery Mix",
        manifestLabel: "Signal Recovery Manifest",
        settings,
        title: "Signal recovery experiment generated",
        detail:
          "A broadband recovery pass combined denoising, band limiting, and light compression to surface masked content.",
        summary:
          "Signal recovery variants and preview artifacts were generated for the active target.",
        warning:
          "Recovery output is experimental and should be reviewed against the original source.",
      }
    );
  }

  async function runFrequencyShiftReversalAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const settings = getModuleSettings(project, moduleId);
    const shiftHz = readNumberSetting(settings, "shiftHz", -120);
    const lowHz = readNumberSetting(settings, "lowHz", 100);
    const highHz = readNumberSetting(settings, "highHz", 5200);
    const gain = readNumberSetting(settings, "gain", 2.1);
    return runRecoveryExperiment(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId,
      {
        filterGraph: `afreqshift=shift=${fixedFilterNumber(shiftHz)},highpass=f=${fixedFilterNumber(
          lowHz
        )},lowpass=f=${fixedFilterNumber(highHz)},volume=${fixedFilterNumber(gain)}`,
        label: "Frequency Shift Reversal",
        manifestLabel: "Frequency Shift Reversal Manifest",
        settings,
        title: "Frequency-shift reversal variant generated",
        detail:
          "A small inverse frequency shift was applied to probe whether heterodyned or pitch-shifted material becomes more intelligible.",
        summary: "Frequency-shift reversal outputs were generated for the active target.",
        warning: "Frequency-shift reversal is exploratory and may distort unshifted material.",
      }
    );
  }

  async function runBandPassExplorationAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const settings = getModuleSettings(project, moduleId);
    const centerHz = readNumberSetting(settings, "centerHz", 1700);
    const widthHz = readNumberSetting(settings, "widthHz", 1800);
    const gain = readNumberSetting(settings, "gain", 6);
    return runRecoveryExperiment(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId,
      {
        filterGraph: `bandpass=f=${fixedFilterNumber(centerHz)}:w=${fixedFilterNumber(
          widthHz
        )},volume=${fixedFilterNumber(gain)}`,
        label: "Band-pass Exploration",
        manifestLabel: "Band-pass Exploration Manifest",
        settings,
        title: "Band-pass exploration variant generated",
        detail:
          "A focused mid-band isolation pass was generated to inspect speech-like or masked content inside the intelligibility range.",
        summary: "Band-pass exploration artifacts were generated for the active target.",
        warning:
          "Band-pass exploration narrows the signal and can remove low or high frequency cues.",
      }
    );
  }

  async function runSpectrogramGuidedRecoveryAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const settings = getModuleSettings(project, moduleId);
    const lowHz = readNumberSetting(settings, "lowHz", 120);
    const highHz = readNumberSetting(settings, "highHz", 4200);
    const gain = readNumberSetting(settings, "gain", 2.6);
    return runRecoveryExperiment(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId,
      {
        filterGraph: `highpass=f=${fixedFilterNumber(lowHz)},lowpass=f=${fixedFilterNumber(
          highHz
        )},afftdn=nf=${getDenoiseNoiseFloor(settings, -20)},volume=${fixedFilterNumber(gain)}`,
        label: "Spectrogram-guided Recovery",
        manifestLabel: "Spectrogram-guided Recovery Manifest",
        settings,
        title: "Spectrogram-guided recovery variant generated",
        detail:
          "A recovery pass emphasized the speech-intelligibility band so spectral ridges can be inspected before deeper transcription attempts.",
        summary: "Spectrogram-guided recovery outputs were generated for the active target.",
        warning:
          "Spectrogram-oriented recovery is optimized for inspection, not faithful listening playback.",
      }
    );
  }

  async function runHiddenPatternExtractionAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const settings = getModuleSettings(project, moduleId);
    const lowHz = readNumberSetting(settings, "lowHz", 220);
    const highHz = readNumberSetting(settings, "highHz", 6400);
    const gain = readNumberSetting(settings, "gain", 5.5);
    const compression = readStringSetting(settings, "compression", "strong");
    const compand =
      compression === "off"
        ? null
        : compression === "light"
          ? "compand=attacks=0:decays=0.35:points=-80/-80|-30/-18|-12/-8|0/-3"
          : "compand=attacks=0:decays=0.25:points=-80/-80|-30/-12|-12/-6|0/-2";
    return runRecoveryExperiment(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId,
      {
        filterGraph: [
          `highpass=f=${fixedFilterNumber(lowHz)}`,
          `lowpass=f=${fixedFilterNumber(highHz)}`,
          compand,
          `volume=${fixedFilterNumber(gain)}`,
        ]
          .filter(Boolean)
          .join(","),
        label: "Hidden Pattern Extraction",
        manifestLabel: "Hidden Pattern Extraction Manifest",
        settings,
        title: "Hidden-pattern extraction variant generated",
        detail:
          "Dynamic-range expansion and band limiting were applied to expose low-level or intermittently masked audio patterns.",
        summary: "Hidden-pattern extraction artifacts were generated for the active target.",
        warning:
          "Pattern extraction can amplify noise as well as faint content, so results need manual review.",
      }
    );
  }

  async function runPhaseRecoveryExperimentAudioAnalyzer(
    runtime: LaboratoryAudioProcessRuntime,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryLocalProcessResult> {
    const settings = getModuleSettings(project, moduleId);
    const phaseMode = readStringSetting(settings, "phaseMode", "side");
    const lowHz = readNumberSetting(settings, "lowHz", 100);
    const highHz = readNumberSetting(settings, "highHz", 5200);
    const gain = readNumberSetting(settings, "gain", 8);
    const panFilter =
      phaseMode === "left"
        ? "pan=mono|c0=c0"
        : phaseMode === "right"
          ? "pan=mono|c0=c1"
          : phaseMode === "mono"
            ? "pan=mono|c0=0.5*c0+0.5*c1"
            : "pan=mono|c0=0.5*c0-0.5*c1";
    return runRecoveryExperiment(
      runtime,
      project,
      requestId,
      jobId,
      target,
      artifactBase,
      moduleOutputDir,
      moduleId,
      {
        filterGraph: `aformat=channel_layouts=stereo,${panFilter},highpass=f=${fixedFilterNumber(
          lowHz
        )},lowpass=f=${fixedFilterNumber(highHz)},volume=${fixedFilterNumber(gain)}`,
        label: "Phase Recovery Experiment",
        manifestLabel: "Phase Recovery Manifest",
        settings,
        title: "Phase-isolation recovery variant generated",
        detail:
          "A side-channel phase isolation experiment was generated to inspect content that may cancel in mono or sit between stereo channels.",
        summary: "Phase-recovery experiment artifacts were generated for the active target.",
        warning:
          "Phase-isolation experiments can collapse on mono or tightly correlated stereo sources.",
      }
    );
  }

  return {
    runBandPassExplorationAudioAnalyzer,
    runFrequencyShiftReversalAudioAnalyzer,
    runHiddenPatternExtractionAudioAnalyzer,
    runPhaseRecoveryExperimentAudioAnalyzer,
    runSignalRecoveryAudioAnalyzer,
    runSpectrogramGuidedRecoveryAudioAnalyzer,
  };
}
