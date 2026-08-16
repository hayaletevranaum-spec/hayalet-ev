import { getAudioAnalysisProcessRootDir } from "../../../shared/host/project-paths.js";
import { normalizeLabAnalysisModuleSettings } from "../../../domain/lab-types.js";
import type { LabSettingsRecord } from "../../../domain/lab-types.js";
import { readStringSetting } from "../../../shared/host/settings-readers.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryRuntimeRecord = LaboratoryRecord & {
  paths?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  slug?: unknown;
  workbench?: unknown;
};

type LaboratoryProcessTargetRecord = LaboratoryRecord & {
  path?: unknown;
};

type LaboratoryDirectoryEntryRecord = LaboratoryRecord & {
  isDirectory?: unknown;
  name?: unknown;
  path?: unknown;
};

type LaboratoryProcessArtifactRecord = LaboratoryRecord & {
  id?: unknown;
};

type LaboratoryProcessFindingRecord = LaboratoryRecord;
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

type LaboratorySourceSeparationStem = {
  fileName: string;
  path: string;
  stemName: string;
};

type LaboratoryAudioAnalysisModelResult = {
  findings: LaboratoryProcessFindingRecord[];
  artifacts: LaboratoryProcessArtifactRecord[];
  warnings: string[];
  status: string;
  summary: string;
};

type AudioAnalysisSourceSeparationModelRunnerDeps = {
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
  listDirectory: (path: string) => Promise<unknown[]>;
  runProfileTool: (
    runtime: LaboratoryRuntimeRecord,
    request: LaboratoryProfileToolRequest
  ) => Promise<unknown>;
  sanitizeFileSegment: (value: string, fallback: string) => string;
  writeJsonFile: (path: string, content: LaboratoryRecord) => Promise<unknown>;
};

function toRecord(value: unknown): LaboratoryRecord {
  return value !== null && typeof value === "object" ? (value as LaboratoryRecord) : {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isNonNullString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function toDirectoryEntryRecord(value: unknown): LaboratoryDirectoryEntryRecord {
  return toRecord(value);
}

function getTargetPath(target: LaboratoryProcessTargetRecord): string | null {
  return asNonEmptyString(target.path);
}

function getArtifactIds(artifacts: LaboratoryProcessArtifactRecord[]): string[] {
  return artifacts
    .map(function (artifact) {
      return asNonEmptyString(artifact.id);
    })
    .filter(isNonNullString);
}

export function createAudioAnalysisSourceSeparationModelRunner(
  deps: AudioAnalysisSourceSeparationModelRunnerDeps
) {
  const {
    clone,
    createProcessArtifact,
    createProcessFinding,
    ensureProcessRuntimeDirectories,
    listDirectory,
    runProfileTool,
    sanitizeFileSegment,
    writeJsonFile,
  } = deps;

  function getProcessRootDir(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord
  ): string {
    return getAudioAnalysisProcessRootDir(
      runtime as unknown as AudioAnalysisProcessRootRuntime,
      project as unknown as AudioAnalysisProcessRootProject
    );
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

  return async function runSourceSeparationAudioAnalyzer(
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

    const targetPath = getTargetPath(target);
    if (targetPath === null) {
      return {
        findings: [],
        artifacts: [],
        warnings: ["Source separation requires an audio target path before processing can start."],
        status: "blocked",
        summary: "Source separation is waiting for a prepared audio target.",
      };
    }

    const settings = getModuleSettings(project, moduleId);
    const modelName = readStringSetting(settings, "model", "htdemucs");
    const device = readStringSetting(settings, "device", "cpu");
    const stemsMode = readStringSetting(settings, "stems", "all");
    const preparedInputBase = sanitizeFileSegment(`${artifactBase}-demucs-input`, "demucs-input");
    const preparedInputPath = `${moduleOutputDir}/${preparedInputBase}.wav`;
    const stemDir = `${moduleOutputDir}/separated/${modelName}/${preparedInputBase}`;
    const manifestPath = `${moduleOutputDir}/${artifactBase}-stems.json`;

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProcessRootDir(runtime, project),
      args: ["-y", "-i", targetPath, "-vn", "-ac", "2", "-ar", "44100", preparedInputPath],
      timeoutMs: 4 * 60 * 1000,
    });

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "demucs",
      cwd: moduleOutputDir,
      args: [
        "-m",
        "demucs",
        "-d",
        device,
        "-n",
        modelName,
        ...(stemsMode === "all" ? [] : ["--two-stems", stemsMode]),
        preparedInputPath,
      ],
      timeoutMs: 30 * 60 * 1000,
    });

    const stems = (await listDirectory(stemDir))
      .map(toDirectoryEntryRecord)
      .filter(function (entry) {
        return (
          entry.isDirectory !== true && /\.(wav|mp3|flac|ogg|m4a)$/i.test(String(entry.name ?? ""))
        );
      })
      .map<LaboratorySourceSeparationStem>(function (entry) {
        const fileName = String(entry.name ?? "");
        return {
          path: String(entry.path ?? ""),
          fileName,
          stemName: fileName.replace(/\.[^.]+$/, "") || fileName,
        };
      });

    if (stems.length === 0) {
      return {
        findings: [],
        artifacts: [],
        warnings: [
          "Demucs finished without producing any stem files in the expected output directory.",
        ],
        status: "failed",
        summary: "Source separation did not produce any isolated stems for the current target.",
      };
    }

    await writeJsonFile(manifestPath, {
      generatedAt: new Date().toISOString(),
      target: clone(target),
      modelName: modelName,
      device,
      stemsMode,
      settingsUsed: settings,
      preparedInputPath: preparedInputPath,
      stemDir: stemDir,
      stems: stems,
    });

    const stemArtifacts = stems.map(function (stem) {
      return createProcessArtifact(
        moduleId,
        "isolated-track",
        stem.path,
        `Separated Stem - ${stem.stemName}`,
        {
          stemName: stem.stemName,
          modelName: modelName,
          device,
          stemsMode,
          settingsUsed: settings,
        }
      );
    });
    const summaryArtifact = createProcessArtifact(
      moduleId,
      "source-separation-manifest",
      manifestPath,
      "Source Separation Manifest",
      {
        modelName: modelName,
        device,
        stemsMode,
        stemCount: stems.length,
        settingsUsed: settings,
        stemNames: stems.map(function (stem) {
          return stem.stemName;
        }),
      }
    );
    const artifacts = [summaryArtifact, ...stemArtifacts];
    const artifactIds = getArtifactIds(artifacts);
    const warningText =
      "Demucs stems can contain bleed or musical artifacts, so isolated tracks should be reviewed manually.";

    return {
      findings: [
        createProcessFinding(
          moduleId,
          "model",
          "low",
          "medium",
          "Separated stem bundle generated",
          `Demucs (${modelName}) produced ${stems.length} isolated stem file(s): ${stems
            .map(function (stem) {
              return stem.stemName;
            })
            .join(", ")}. ${warningText}`,
          stems.length,
          artifactIds
        ),
      ],
      artifacts: artifacts,
      warnings: [warningText],
      status: "ready",
      summary: "Source separation generated isolated stems for the active audio target.",
    };
  };
}
