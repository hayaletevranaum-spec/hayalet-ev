import {
  getAudioAnalysisDiarizationDir,
  getAudioAnalysisDiarizationScriptPath,
  getAudioAnalysisProcessRootDir,
} from "../../../shared/host/project-paths.js";
import { normalizeLabAnalysisModuleSettings } from "../../../domain/lab-types.js";
import type { LabSettingsRecord } from "../../../domain/lab-types.js";
import { readNumberSetting, readStringSetting } from "../../../shared/host/settings-readers.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryRuntimeRecord = LaboratoryRecord & {
  packageToolsDir?: unknown;
  paths?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  slug?: unknown;
  workbench?: unknown;
};

type LaboratoryProcessTargetRecord = LaboratoryRecord & {
  path?: unknown;
};

type LaboratoryProcessArtifactRecord = LaboratoryRecord & {
  id?: unknown;
};

type LaboratoryProcessFindingRecord = LaboratoryRecord;
type AudioAnalysisDiarizationRuntime = Parameters<typeof getAudioAnalysisDiarizationDir>[0];
type AudioAnalysisProcessRootRuntime = Parameters<typeof getAudioAnalysisProcessRootDir>[0];
type AudioAnalysisProcessRootProject = Parameters<typeof getAudioAnalysisProcessRootDir>[1];

type LaboratoryProfileToolRequest = {
  requestId: string;
  jobId: string;
  toolId: string;
  cwd: string;
  args: string[];
  timeoutMs: number;
};

type LaboratorySpeakerDiarizationPayload = LaboratoryRecord & {
  durationSeconds?: unknown;
  effectiveNumSpeakers?: unknown;
  fallbackApplied?: unknown;
  purityCluster?: unknown;
  puritySpeaker?: unknown;
  segments?: unknown;
  speakerCount?: unknown;
  speakerCountMode?: unknown;
};

type LaboratoryAudioAnalysisModelResult = {
  findings: LaboratoryProcessFindingRecord[];
  artifacts: LaboratoryProcessArtifactRecord[];
  warnings: string[];
  status: string;
  summary: string;
};

type AudioAnalysisSpeakerDiarizationModelRunnerDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
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
    confidence: string,
    level: string,
    title: string,
    detail: string,
    evidenceCount: number,
    artifactIds: string[]
  ) => LaboratoryProcessFindingRecord;
  ensureProcessRuntimeDirectories: (
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    moduleOutputDir: string
  ) => Promise<unknown>;
  readJsonFile: (path: string) => Promise<unknown>;
  runProfileTool: (
    runtime: LaboratoryRuntimeRecord,
    request: LaboratoryProfileToolRequest
  ) => Promise<unknown>;
  sanitizeFileSegment: (value: string, fallback: string) => string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

function isNonNullString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export function createAudioAnalysisSpeakerDiarizationModelRunner(
  deps: AudioAnalysisSpeakerDiarizationModelRunnerDeps
) {
  const {
    asNonEmptyString,
    asNumber,
    createProcessArtifact,
    createProcessFinding,
    ensureProcessRuntimeDirectories,
    readJsonFile,
    runProfileTool,
    sanitizeFileSegment,
    toRecord,
  } = deps;

  function toTargetRecord(value: unknown): LaboratoryProcessTargetRecord {
    return toRecord(value);
  }

  function toSummaryPayload(value: unknown): LaboratorySpeakerDiarizationPayload {
    return toRecord(value);
  }

  function getArtifactIds(artifacts: LaboratoryProcessArtifactRecord[]): string[] {
    return artifacts
      .map(function (artifact) {
        return asNonEmptyString(artifact.id);
      })
      .filter(isNonNullString);
  }

  function getModuleSettings(
    project: LaboratoryProjectRecord,
    moduleId: string
  ): LabSettingsRecord {
    const workbench = toRecord(project.workbench);
    const analysisSettings = toRecord(workbench["analysisSettings"]);
    const moduleSettings = toRecord(analysisSettings["modules"]);
    return normalizeLabAnalysisModuleSettings(moduleId, moduleSettings[moduleId]);
  }

  function getProcessRootDir(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord
  ): string {
    return getAudioAnalysisProcessRootDir(
      runtime as unknown as AudioAnalysisProcessRootRuntime,
      project as unknown as AudioAnalysisProcessRootProject
    );
  }

  return async function runSpeakerDiarizationAudioAnalyzer(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProcessTargetRecord,
    artifactBase: string,
    moduleOutputDir: string,
    moduleId: string
  ): Promise<LaboratoryAudioAnalysisModelResult> {
    await ensureProcessRuntimeDirectories(runtime, project, requestId, moduleOutputDir);

    const targetPath = asNonEmptyString(toTargetRecord(target).path);
    if (targetPath === null) {
      return {
        findings: [],
        artifacts: [],
        warnings: [
          "Speaker diarization requires an audio target path before processing can start.",
        ],
        status: "blocked",
        summary: "Speaker diarization is waiting for a prepared audio target.",
      };
    }

    const diarizationScriptPath = getAudioAnalysisDiarizationScriptPath(
      runtime as unknown as AudioAnalysisDiarizationRuntime
    );
    if (diarizationScriptPath === null) {
      return {
        findings: [],
        artifacts: [],
        warnings: ["Room-local diarization helper script is unavailable on this runtime."],
        status: "blocked",
        summary: "Speaker diarization helper assets are missing from the room package.",
      };
    }

    const preparedInputBase = sanitizeFileSegment(`${artifactBase}-speaker-input`, "speaker-input");
    const preparedInputPath = `${moduleOutputDir}/${preparedInputBase}.wav`;
    const summaryPath = `${moduleOutputDir}/${artifactBase}-speaker-diarization.json`;
    const settings = getModuleSettings(project, moduleId);
    const speakerCountSetting = readStringSetting(settings, "speakerCount", "auto");
    const speakerCount =
      speakerCountSetting === "auto"
        ? 0
        : Math.max(0, Math.round(Number(speakerCountSetting) || 0));
    const minSegmentSeconds = readNumberSetting(settings, "minSegmentSeconds", 1.5);
    const midStep = Math.max(0.05, minSegmentSeconds / 5);

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProcessRootDir(runtime, project),
      args: ["-y", "-i", targetPath, "-vn", "-ac", "1", "-ar", "16000", preparedInputPath],
      timeoutMs: 4 * 60 * 1000,
    });

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "pyaudioanalysis",
      cwd:
        getAudioAnalysisDiarizationDir(runtime as unknown as AudioAnalysisDiarizationRuntime) ||
        getProcessRootDir(runtime, project),
      args: [
        diarizationScriptPath,
        "--input",
        preparedInputPath,
        "--output",
        summaryPath,
        "--num-speakers",
        String(speakerCount),
        "--mid-window",
        String(minSegmentSeconds),
        "--mid-step",
        String(midStep),
      ],
      timeoutMs: 12 * 60 * 1000,
    });

    const summaryPayload = toSummaryPayload(await readJsonFile(summaryPath));
    const segments = Array.isArray(summaryPayload.segments)
      ? summaryPayload.segments.map(toRecord)
      : [];
    const fallbackApplied = summaryPayload.fallbackApplied === true;
    const effectiveNumSpeakers = asNumber(summaryPayload.effectiveNumSpeakers);
    const diarizationSummary = {
      speakerCount:
        typeof summaryPayload.speakerCount === "number" ? summaryPayload.speakerCount : null,
      segmentCount: segments.length,
      durationSeconds: asNumber(summaryPayload.durationSeconds),
      purityCluster: asNumber(summaryPayload.purityCluster),
      puritySpeaker: asNumber(summaryPayload.puritySpeaker),
      effectiveNumSpeakers: effectiveNumSpeakers,
      speakerCountMode: asNonEmptyString(summaryPayload.speakerCountMode),
      fallbackApplied: fallbackApplied,
      settingsUsed: settings,
    };
    const summaryArtifact = createProcessArtifact(
      moduleId,
      "speaker-segments-summary",
      summaryPath,
      "Speaker Diarization Summary",
      {
        diarizationSummary: diarizationSummary,
        segments: segments,
        settingsUsed: settings,
      }
    );
    const artifacts = [summaryArtifact];
    const artifactIds = getArtifactIds(artifacts);
    const detailParts = [
      typeof diarizationSummary.speakerCount === "number"
        ? `${diarizationSummary.speakerCount} speakers`
        : null,
      `${segments.length} segments`,
      typeof diarizationSummary.durationSeconds === "number"
        ? `${Number(diarizationSummary.durationSeconds).toFixed(1)}s analyzed`
        : null,
    ].filter(Boolean);
    const fallbackWarning = fallbackApplied
      ? "The packaged pyAudioAnalysis diarization path was unavailable for this clip, so the room-local helper used a heuristic speaker segmentation fallback."
      : null;
    const reviewWarning =
      "pyAudioAnalysis diarization is a fully local heuristic pipeline; speaker boundaries should be reviewed manually.";
    const warningText = [fallbackWarning, reviewWarning].filter(Boolean).join(" ");
    const warnings = [fallbackWarning, reviewWarning].filter(isNonNullString);

    return {
      findings: [
        createProcessFinding(
          moduleId,
          "descriptor",
          "low",
          "low",
          "Speaker timeline generated",
          detailParts.length > 0
            ? `The local diarization pipeline produced ${detailParts.join(", ")}. ${warningText}`
            : `The local diarization pipeline produced a speaker timeline. ${warningText}`,
          segments.length,
          artifactIds
        ),
      ],
      artifacts: artifacts,
      warnings: warnings,
      status: "ready",
      summary:
        "Speaker diarization generated a local speaker timeline for the active audio target.",
    };
  };
}
