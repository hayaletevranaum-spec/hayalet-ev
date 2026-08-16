import {
  getAudioAnalysisProcessRootDir,
  getAudioAnalysisYamnetDir,
  getAudioAnalysisYamnetScriptPath,
} from "../../../shared/host/project-paths.js";
import { normalizeLabAnalysisModuleSettings } from "../../../domain/lab-types.js";
import type { LabSettingsRecord } from "../../../domain/lab-types.js";
import { readNumberSetting } from "../../../shared/host/settings-readers.js";

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
type AudioAnalysisProcessRootRuntime = Parameters<typeof getAudioAnalysisProcessRootDir>[0];
type AudioAnalysisProcessRootProject = Parameters<typeof getAudioAnalysisProcessRootDir>[1];
type AudioAnalysisYamnetRuntime = Parameters<typeof getAudioAnalysisYamnetDir>[0];

type LaboratoryProfileToolRequest = {
  requestId: string;
  jobId: string;
  toolId: string;
  cwd: string;
  args: string[];
  timeoutMs: number;
};

type LaboratorySoundEventClassRecord = LaboratoryRecord & {
  className?: unknown;
  label?: unknown;
  score?: unknown;
};

type LaboratorySoundEventsPayload = LaboratoryRecord & {
  modelVersion?: unknown;
  topClasses?: unknown;
  warning?: unknown;
};

type LaboratoryAudioAnalysisModelResult = {
  findings: LaboratoryProcessFindingRecord[];
  artifacts: LaboratoryProcessArtifactRecord[];
  warnings: string[];
  status: string;
  summary: string;
};

type AudioAnalysisSoundEventsModelRunnerDeps = {
  asNonEmptyString: (value: unknown) => string | null;
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
  toRecord: (value: unknown) => LaboratoryRecord;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
}

function isNonNullString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export function createAudioAnalysisSoundEventsModelRunner(
  deps: AudioAnalysisSoundEventsModelRunnerDeps
) {
  const {
    asNonEmptyString,
    createProcessArtifact,
    createProcessFinding,
    ensureProcessRuntimeDirectories,
    readJsonFile,
    runProfileTool,
    toRecord,
  } = deps;

  function toTargetRecord(value: unknown): LaboratoryProcessTargetRecord {
    return toRecord(value);
  }

  function toSummaryPayload(value: unknown): LaboratorySoundEventsPayload {
    return toRecord(value);
  }

  function toSoundEventClassRecord(value: unknown): LaboratorySoundEventClassRecord {
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

  return async function runSoundEventsAudioAnalyzer(
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
          "Sound event analysis requires an audio target path before processing can start.",
        ],
        status: "blocked",
        summary: "Sound event analysis is waiting for a prepared audio target.",
      };
    }

    const yamnetScriptPath = getAudioAnalysisYamnetScriptPath(
      runtime as unknown as AudioAnalysisYamnetRuntime
    );
    if (yamnetScriptPath === null) {
      return {
        findings: [],
        artifacts: [],
        warnings: ["Room-local YAMNet helper script is unavailable on this runtime."],
        status: "blocked",
        summary: "YAMNet helper assets are missing from the room package.",
      };
    }

    const wavPath = `${moduleOutputDir}/${artifactBase}-yamnet.wav`;
    const summaryPath = `${moduleOutputDir}/${artifactBase}-sound-events.json`;
    const settings = getModuleSettings(project, moduleId);
    const topK = Math.round(readNumberSetting(settings, "topK", 8));
    const threshold = readNumberSetting(settings, "threshold", 0.15);

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProcessRootDir(runtime, project),
      args: ["-y", "-i", targetPath, "-vn", "-ac", "1", "-ar", "16000", wavPath],
      timeoutMs: 3 * 60 * 1000,
    });

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "yamnet",
      cwd:
        getAudioAnalysisYamnetDir(runtime as unknown as AudioAnalysisYamnetRuntime) ||
        getProcessRootDir(runtime, project),
      args: [
        yamnetScriptPath,
        "--input",
        wavPath,
        "--output",
        summaryPath,
        "--top-k",
        String(topK),
        "--threshold",
        String(threshold),
      ],
      timeoutMs: 8 * 60 * 1000,
    });

    const summaryPayload = toSummaryPayload(await readJsonFile(summaryPath));
    const topClasses = Array.isArray(summaryPayload.topClasses)
      ? summaryPayload.topClasses.map(toSoundEventClassRecord)
      : [];
    const headline = topClasses[0] || null;
    const summaryArtifact = createProcessArtifact(
      moduleId,
      "sound-events-summary",
      summaryPath,
      "Sound Events Summary",
      {
        topClasses: topClasses,
        modelVersion: asNonEmptyString(summaryPayload.modelVersion),
        classCount: topClasses.length,
        topK,
        threshold,
        settingsUsed: settings,
      }
    );
    const artifacts = [summaryArtifact];
    const artifactIds = getArtifactIds(artifacts);
    const warningText =
      asNonEmptyString(summaryPayload.warning) ||
      "YAMNet predictions are broad sound-event suggestions and should be reviewed manually.";

    return {
      findings:
        headline !== null
          ? [
              createProcessFinding(
                moduleId,
                "model",
                "low",
                (asNumber(headline.score) ?? 0) >= 0.35 ? "medium" : "low",
                "Top sound event candidates captured",
                `Top class: ${asNonEmptyString(headline.label) || asNonEmptyString(headline.className) || "unknown"} (${asNumber(headline.score)?.toFixed(3) ?? "n/a"}). ${warningText}`,
                topClasses.length,
                artifactIds
              ),
            ]
          : [],
      artifacts: artifacts,
      warnings: [warningText],
      status: "ready",
      summary: "Sound event candidates were generated from the active audio target.",
    };
  };
}
