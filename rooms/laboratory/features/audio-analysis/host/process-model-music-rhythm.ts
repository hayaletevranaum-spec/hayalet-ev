import {
  getAudioAnalysisMusicDir,
  getAudioAnalysisMusicScriptPath,
  getAudioAnalysisProcessRootDir,
} from "../../../shared/host/project-paths.js";
import { normalizeLabAnalysisModuleSettings } from "../../../domain/lab-types.js";
import type { LabSettingsRecord } from "../../../domain/lab-types.js";
import {
  readBooleanSetting,
  readNumberSetting,
  readStringSetting,
} from "../../../shared/host/settings-readers.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryRuntimeRecord = LaboratoryRecord & {
  packageToolsDir?: unknown;
  paths?: unknown;
};
type LaboratoryAudioAnalysisMusicScriptRuntime = Parameters<
  typeof getAudioAnalysisMusicScriptPath
>[0];
type LaboratoryAudioAnalysisProcessRootRuntime = Parameters<
  typeof getAudioAnalysisProcessRootDir
>[0];
type LaboratoryAudioAnalysisProcessRootProject = Parameters<
  typeof getAudioAnalysisProcessRootDir
>[1];

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

type LaboratoryProfileToolRequest = {
  requestId: string;
  jobId: string;
  toolId: string;
  cwd: string;
  args: string[];
  timeoutMs: number;
};

type LaboratoryMusicRhythmPayload = LaboratoryRecord & {
  essentia?: unknown;
  musicSummary?: unknown;
};

type LaboratoryAudioAnalysisModelResult = {
  findings: LaboratoryProcessFindingRecord[];
  artifacts: LaboratoryProcessArtifactRecord[];
  warnings: string[];
  status: string;
  summary: string;
};

type AudioAnalysisMusicRhythmModelRunnerDeps = {
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
  sanitizeFileSegment: (value: string, fallback: string) => string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

function isNonNullString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export function createAudioAnalysisMusicRhythmModelRunner(
  deps: AudioAnalysisMusicRhythmModelRunnerDeps
) {
  const {
    asNonEmptyString,
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

  function toSummaryPayload(value: unknown): LaboratoryMusicRhythmPayload {
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

  function asMusicScriptRuntime(
    runtime: LaboratoryRuntimeRecord
  ): LaboratoryAudioAnalysisMusicScriptRuntime {
    return runtime as unknown as LaboratoryAudioAnalysisMusicScriptRuntime;
  }

  function asProcessRootRuntime(
    runtime: LaboratoryRuntimeRecord
  ): LaboratoryAudioAnalysisProcessRootRuntime {
    return runtime as unknown as LaboratoryAudioAnalysisProcessRootRuntime;
  }

  function asProcessRootProject(
    project: LaboratoryProjectRecord
  ): LaboratoryAudioAnalysisProcessRootProject {
    return project as unknown as LaboratoryAudioAnalysisProcessRootProject;
  }

  return async function runMusicRhythmAudioAnalyzer(
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
        warnings: ["Music analysis requires an audio target path before processing can start."],
        status: "blocked",
        summary: "Music analysis is waiting for a prepared audio target.",
      };
    }

    const musicScriptPath = getAudioAnalysisMusicScriptPath(asMusicScriptRuntime(runtime));
    if (musicScriptPath === null) {
      return {
        findings: [],
        artifacts: [],
        warnings: ["Room-local music analysis helper script is unavailable on this runtime."],
        status: "blocked",
        summary: "Music analysis helper assets are missing from the room package.",
      };
    }

    const preparedInputBase = sanitizeFileSegment(`${artifactBase}-music-input`, "music-input");
    const preparedInputPath = `${moduleOutputDir}/${preparedInputBase}.wav`;
    const summaryPath = `${moduleOutputDir}/${artifactBase}-music-analysis.json`;
    const settings = getModuleSettings(project, moduleId);
    const sampleRate = Math.round(readNumberSetting(settings, "sampleRate", 22050));
    const focus = readStringSetting(settings, "focus", "balanced");
    const essentiaFallback = readBooleanSetting(settings, "essentiaFallback", true);

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getAudioAnalysisProcessRootDir(
        asProcessRootRuntime(runtime),
        asProcessRootProject(project)
      ),
      args: [
        "-y",
        "-i",
        targetPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        preparedInputPath,
      ],
      timeoutMs: 4 * 60 * 1000,
    });

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "librosa",
      cwd:
        getAudioAnalysisMusicDir(asMusicScriptRuntime(runtime)) ||
        getAudioAnalysisProcessRootDir(
          asProcessRootRuntime(runtime),
          asProcessRootProject(project)
        ),
      args: [
        musicScriptPath,
        "--input",
        preparedInputPath,
        "--output",
        summaryPath,
        "--sample-rate",
        String(sampleRate),
        "--focus",
        focus,
        ...(essentiaFallback ? [] : ["--skip-essentia"]),
      ],
      timeoutMs: 10 * 60 * 1000,
    });

    const summaryPayload = toSummaryPayload(await readJsonFile(summaryPath));
    const musicSummary = toRecord(summaryPayload.musicSummary);
    const essentiaSummary = toRecord(summaryPayload.essentia);
    const summaryArtifact = createProcessArtifact(
      moduleId,
      "music-analysis-summary",
      summaryPath,
      "Music Analysis Summary",
      {
        musicSummary: musicSummary,
        essentia: essentiaSummary,
        focus,
        sampleRate,
        essentiaFallback,
        settingsUsed: settings,
      }
    );
    const artifacts = [summaryArtifact];
    const artifactIds = getArtifactIds(artifacts);
    const detailParts = [
      typeof musicSummary["tempoBpm"] === "number"
        ? `${Number(musicSummary["tempoBpm"]).toFixed(1)} BPM`
        : null,
      typeof musicSummary["dominantPitchClass"] === "string" &&
      musicSummary["dominantPitchClass"].trim() !== ""
        ? `dominant pitch class ${musicSummary["dominantPitchClass"]}`
        : null,
      typeof musicSummary["beatCount"] === "number"
        ? `${musicSummary["beatCount"]} beat markers`
        : null,
    ].filter(Boolean);
    const warnings = [];
    if (asNonEmptyString(essentiaSummary["error"]) !== null) {
      warnings.push(asNonEmptyString(essentiaSummary["error"]));
    }
    warnings.push(
      "Music and rhythm analysis is descriptor-driven; tonal summaries should be treated as guidance rather than a full musicology readout."
    );

    return {
      findings: [
        createProcessFinding(
          moduleId,
          "descriptor",
          "low",
          essentiaSummary["available"] === true ? "medium" : "low",
          "Music descriptor summary generated",
          detailParts.length > 0
            ? `The music analysis helper produced ${detailParts.join(", ")} for the active target.`
            : "The music analysis helper produced a descriptor summary for the active target.",
          detailParts.length,
          artifactIds
        ),
      ],
      artifacts: artifacts,
      warnings: warnings.filter(isNonNullString),
      status: "ready",
      summary: "Music and rhythm descriptors were generated for the active audio target.",
    };
  };
}
